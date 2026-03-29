/**
 * Pipeline query editor — open aggregation pipeline in $EDITOR.
 *
 * Writes a JSON5 temp file pre-populated from current state.
 * Also writes a JSON Schema sidecar for jsonls field completions.
 * On save+quit, parses the pipeline and classifies it as find-compatible
 * or full aggregate.
 */

import { tmpdir } from "os"
import { join } from "path"
import { mkdir } from "fs/promises"
import type { Document } from "mongodb"
import JSON5 from "json5"
import { EJSON } from "bson"
import type { SchemaMap } from "../query/schema"
import { parseSimpleQueryFull } from "../query/parser"
import { classifyPipeline } from "../query/pipeline"
import { getEditor } from "../utils/editor"

export interface PipelineResult {
  pipeline: Document[]
  source: string
  isAggregate: boolean
}

// ── Template generation ─────────────────────────────────────────────────────

/** Regex matching the Mon-Q comment header block at the top of a pipeline file */
const PIPELINE_HEADER_RE = /^(\/\/[^\n]*\n)*\n/

/** Build the comment header prepended to every pipeline file on open */
function buildHeader(collectionName: string, dbName: string, schemaMap: SchemaMap): string {
  const topLevelFields = [...schemaMap.entries()].filter(([p]) => !p.includes("."))
  const fieldLines =
    topLevelFields.length > 0
      ? topLevelFields.map(([p, info]) => `//   ${p}: ${info.type}`)
      : [`//   (no schema sampled)`]

  return [
    `// Mon-Q — MongoDB aggregation pipeline for ${collectionName} @ ${dbName}`,
    `// Save to apply (:wq). Quit without saving (:q!) to cancel.`,
    `//`,
    `// Schema (${collectionName}):`,
    ...fieldLines,
    `//`,
    `// Doc structure: { "pipeline": [ { "$match": {} }, { "$sort": {} }, ... ] }`,
    `// $match operators: $eq $ne $gt $gte $lt $lte $in $nin $regex $exists $elemMatch $and $or`,
    `// Stages that trigger aggregate(): $group $lookup $unwind $limit $skip $count $addFields`,
    ``,
  ].join("\n")
}

function buildTemplate(
  collectionName: string,
  dbName: string,
  currentPipelineSource: string,
  currentPipeline: Document[],
  simpleQuery: string,
  schemaMap: SchemaMap,
  sortField: string | null,
  sortDirection: 1 | -1,
): string {
  const header = buildHeader(collectionName, dbName, schemaMap)

  // Re-open existing pipeline — strip any previous header and re-prepend a fresh one
  if (currentPipelineSource.trim()) {
    const body = currentPipelineSource.replace(PIPELINE_HEADER_RE, "")
    return header + body
  }

  // Pipeline is active but was entered programmatically (no source string) —
  // serialize the live pipeline stages so the user can edit what's actually running
  if (currentPipeline.length > 0) {
    const doc = { $schema: "./.monq-pipeline-schema.json", pipeline: currentPipeline }
    return header + JSON.stringify(doc, null, 2) + "\n"
  }

  // Parse filter + projection from simple query string
  let matchObj: Record<string, unknown> = {}
  let projObj: Record<string, 0 | 1> | undefined
  if (simpleQuery.trim()) {
    try {
      const parsed = parseSimpleQueryFull(simpleQuery, schemaMap)
      matchObj = parsed.filter as Record<string, unknown>
      projObj = parsed.projection
    } catch {
      matchObj = {}
    }
  }

  // Build $sort
  const sortObj = sortField ? { [sortField]: sortDirection } : { _id: -1 }

  // Compose pipeline stages
  const pipelineStages: Document[] = [{ $match: matchObj }, { $sort: sortObj }]
  if (projObj) pipelineStages.push({ $project: projObj })

  const doc = {
    $schema: "./.monq-pipeline-schema.json",
    pipeline: pipelineStages,
  }

  return header + JSON.stringify(doc, null, 2) + "\n"
}

// ── JSON Schema sidecar ─────────────────────────────────────────────────────

/**
 * Schema for a field value in $match — typed as object so jsonls always
 * suggests the $ operators when the user types { inside the field value.
 * We don't use oneOf (jsonls picks the first matching branch and stops).
 */
function fieldValueSchema(fieldName: string, fieldType: string): Record<string, unknown> {
  return {
    description: `${fieldName} (${fieldType})`,
    // No "type" restriction — accept direct value OR operator object.
    // jsonls will suggest all properties when user types {.
    properties: {
      // Comparison
      $eq: { description: "Equal to value" },
      $ne: { description: "Not equal to value" },
      $gt: { description: "Greater than value" },
      $gte: { description: "Greater than or equal to value" },
      $lt: { description: "Less than value" },
      $lte: { description: "Less than or equal to value" },
      // Array membership
      $in: { type: "array", description: "Matches any value in array", items: {} },
      $nin: { type: "array", description: "Matches no value in array", items: {} },
      $all: { type: "array", description: "Array contains all values", items: {} },
      // Existence / type
      $exists: { type: "boolean", description: "true = field exists, false = field missing" },
      $type: {
        description:
          "BSON type: string | number | bool | date | objectId | array | object | null | int | long | double | decimal",
      },
      // String / regex
      $regex: { type: "string", description: 'Regular expression pattern (e.g. "^stefan")' },
      $options: {
        type: "string",
        description: "Regex flags: i (case-insensitive), m (multiline), s (dotAll), x (extended)",
      },
      // Array operators
      $elemMatch: {
        type: "object",
        description: "At least one array element matches all conditions",
        properties: {},
      },
      $size: { type: "number", description: "Array has exactly N elements" },
      // Arithmetic
      $mod: {
        type: "array",
        description: "[divisor, remainder] — value mod divisor = remainder",
        items: { type: "number" },
      },
      // Negation
      $not: {
        type: "object",
        description: "Negates operator expression, e.g. { $not: { $gt: 5 } }",
        properties: {},
      },
    },
  }
}

function buildJsonSchema(collectionName: string, schemaMap: SchemaMap): string {
  // $match properties — top-level logical operators + per-field operators
  const matchProperties: Record<string, unknown> = {
    $and: { type: "array", description: "All conditions must match", items: { type: "object" } },
    $or: {
      type: "array",
      description: "At least one condition must match",
      items: { type: "object" },
    },
    $nor: { type: "array", description: "No conditions match", items: { type: "object" } },
    $expr: { type: "object", description: "Aggregation expression in query context" },
    $text: {
      type: "object",
      description: "Full-text search",
      properties: {
        $search: { type: "string", description: "Search string" },
        $language: { type: "string", description: "Language for stemming" },
        $caseSensitive: { type: "boolean" },
        $diacriticSensitive: { type: "boolean" },
      },
    },
  }

  for (const [path, info] of schemaMap) {
    if (path.includes(".")) continue
    matchProperties[path] = fieldValueSchema(path, info.type)
  }

  const schema = {
    $schema: "http://json-schema.org/draft-07/schema",
    title: `Mon-Q Pipeline — ${collectionName}`,
    type: "object",
    properties: {
      pipeline: {
        type: "array",
        description: "MongoDB aggregation pipeline stages",
        items: {
          oneOf: [
            {
              type: "object",
              description: "$match — filter documents",
              properties: {
                $match: {
                  type: "object",
                  description: "MongoDB query filter",
                  properties: matchProperties,
                },
              },
              required: ["$match"],
              additionalProperties: false,
            },
            {
              type: "object",
              description: "$sort — sort documents",
              properties: { $sort: { type: "object" } },
              required: ["$sort"],
              additionalProperties: false,
            },
            {
              type: "object",
              description: "$project — include/exclude fields",
              properties: { $project: { type: "object" } },
              required: ["$project"],
              additionalProperties: false,
            },
            {
              type: "object",
              description: "$group — group and aggregate",
              properties: { $group: { type: "object" } },
              required: ["$group"],
              additionalProperties: false,
            },
            {
              type: "object",
              description: "$lookup — join with another collection",
              properties: { $lookup: { type: "object" } },
              required: ["$lookup"],
              additionalProperties: false,
            },
            {
              type: "object",
              description: "$unwind — deconstruct array field",
              properties: {
                $unwind: { oneOf: [{ type: "string" }, { type: "object" }] },
              },
              required: ["$unwind"],
              additionalProperties: false,
            },
            {
              type: "object",
              description: "$limit — limit number of documents",
              properties: { $limit: { type: "number" } },
              required: ["$limit"],
              additionalProperties: false,
            },
            {
              type: "object",
              description: "$skip — skip N documents",
              properties: { $skip: { type: "number" } },
              required: ["$skip"],
              additionalProperties: false,
            },
            {
              type: "object",
              description: "$count — count documents into a field",
              properties: { $count: { type: "string" } },
              required: ["$count"],
              additionalProperties: false,
            },
            {
              type: "object",
              description: "$addFields — add computed fields",
              properties: { $addFields: { type: "object" } },
              required: ["$addFields"],
              additionalProperties: false,
            },
          ],
        },
      },
    },
  }

  return JSON.stringify(schema, null, 2)
}

// ── Editor argument builder ─────────────────────────────────────────────────

/**
 * Build editor command args, positioning cursor inside the first pipeline stage.
 * For vim/nvim: lands on the line after the opening `{` of the first stage value.
 * For other editors: just open the file.
 */
function buildEditorArgs(editorBase: string, queryFile: string, content: string): string[] {
  const isVimLike = /^(nvim|vim|vi|gvim|view|rvim)$/.test(editorBase)
  if (!isVimLike) return [editorBase, queryFile]

  const lines = content.split("\n")
  for (let i = 0; i < lines.length; i++) {
    // Match any pipeline stage: `"$anything": {`
    if (/"\$\w+":\s*\{/.test(lines[i])) {
      const nextLine = lines[i + 1] ?? ""
      const col = (nextLine.match(/^(\s*)/)?.[1].length ?? 0) + 1
      return [editorBase, `+call cursor(${i + 2}, ${col})`, queryFile]
    }
  }

  return [editorBase, queryFile]
}

// ── Main entry point ────────────────────────────────────────────────────────

/** Derive the stable pipeline file paths for a given tab */
export function pipelineFilePaths(dbName: string, collectionName: string, tabId: string) {
  const dir = join(tmpdir(), "monq", dbName, collectionName, tabId)
  return {
    dir,
    queryFile: join(dir, "pipeline.jsonc"),
    schemaFile: join(dir, ".monq-pipeline-schema.json"),
  }
}

/**
 * Write the pipeline file and schema sidecar to disk (without opening an editor).
 * Used by Ctrl+E to ensure the file exists before handing it to an external tool.
 */
export async function writePipelineFile(params: {
  collectionName: string
  dbName: string
  tabId: string
  pipelineSource: string
  currentPipeline: Document[]
  simpleQuery: string
  schemaMap: SchemaMap
  sortField: string | null
  sortDirection: 1 | -1
}): Promise<string> {
  const {
    collectionName,
    dbName,
    tabId,
    pipelineSource,
    currentPipeline,
    simpleQuery,
    schemaMap,
    sortField,
    sortDirection,
  } = params
  const { dir, queryFile, schemaFile } = pipelineFilePaths(dbName, collectionName, tabId)
  await mkdir(dir, { recursive: true })
  await Bun.write(schemaFile, buildJsonSchema(collectionName, schemaMap))
  const content = buildTemplate(
    collectionName,
    dbName,
    pipelineSource,
    currentPipeline,
    simpleQuery,
    schemaMap,
    sortField,
    sortDirection,
  )
  await Bun.write(queryFile, content)
  return queryFile
}

export async function openPipelineEditor(params: {
  collectionName: string
  dbName: string
  tabId: string
  pipelineSource: string
  currentPipeline: Document[]
  simpleQuery: string
  schemaMap: SchemaMap
  sortField: string | null
  sortDirection: 1 | -1
}): Promise<PipelineResult | null> {
  const {
    collectionName,
    dbName,
    tabId,
    pipelineSource,
    currentPipeline,
    simpleQuery,
    schemaMap,
    sortField,
    sortDirection,
  } = params

  // Stable temp dir scoped to db + collection + tab
  const { dir, queryFile, schemaFile } = pipelineFilePaths(dbName, collectionName, tabId)
  await mkdir(dir, { recursive: true })

  // Write schema sidecar
  await Bun.write(schemaFile, buildJsonSchema(collectionName, schemaMap))

  // Write initial content
  const template = buildTemplate(
    collectionName,
    dbName,
    pipelineSource,
    currentPipeline,
    simpleQuery,
    schemaMap,
    sortField,
    sortDirection,
  )
  await Bun.write(queryFile, template)

  const editor = getEditor()
  const editorBase = editor.split("/").pop() ?? editor

  // Edit-parse loop: re-open editor on parse errors so user can fix in place
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const args = buildEditorArgs(editorBase, queryFile, template)
    const proc = Bun.spawn(args, {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
    await proc.exited

    // Read back
    let content: string
    try {
      content = await Bun.file(queryFile).text()
    } catch {
      return null
    }

    // Cancel if unchanged from the initial template (user quit without saving — :q!)
    if (content.trim() === template.trim()) {
      return null
    }

    // Try to parse
    let parsed: { pipeline?: Document[] }
    try {
      parsed = JSON5.parse(content)
    } catch (err) {
      // Prepend error as a comment and re-open so user can fix it
      const errMsg = (err as Error).message
      const errorComment = `// !! PARSE ERROR: ${errMsg}\n// Fix the JSON below and save again. Quit with :q! to cancel.\n\n`
      // Strip any previous error comment before prepending
      const cleaned = content.replace(/^(\/\/ !! PARSE ERROR:.*\n.*\n\n)/m, "")
      await Bun.write(queryFile, errorComment + cleaned)
      continue // re-open editor
    }

    const rawPipeline: Document[] = Array.isArray(parsed.pipeline)
      ? parsed.pipeline
      : Array.isArray(parsed)
        ? parsed // user wrote just a bare array
        : []

    if (rawPipeline.length === 0) {
      return null
    }

    // Deserialize EJSON extended types (e.g. { "$oid": "..." } → ObjectId)
    const pipeline = EJSON.deserialize(rawPipeline) as Document[]

    const isAggregate = classifyPipeline(pipeline)
    return { pipeline, source: content, isAggregate }
  }
}
