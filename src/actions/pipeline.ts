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
import type { SchemaMap } from "../query/schema"
import { parseSimpleQuery } from "../query/parser"

// Stages that can be expressed as find(filter, { sort, projection })
const FIND_COMPATIBLE_STAGES = new Set(["$match", "$sort", "$project"])

export interface PipelineResult {
  pipeline: Document[]
  source: string
  isAggregate: boolean
}

/** Classify whether a pipeline can be run as find() */
export function classifyPipeline(pipeline: Document[]): boolean {
  if (pipeline.length === 0) return false
  return pipeline.some(
    (stage) => !FIND_COMPATIBLE_STAGES.has(Object.keys(stage)[0])
  )
}

/** Extract find()-compatible parts from a simple pipeline */
export function extractFindParts(pipeline: Document[]): {
  filter: Document
  sort?: Document
  projection?: Document
} {
  const filter = (pipeline.find((s) => "$match" in s) as any)?.$match ?? {}
  const sort   = (pipeline.find((s) => "$sort"  in s) as any)?.$sort
  const projection = (pipeline.find((s) => "$project" in s) as any)?.$project
  return { filter, sort, projection }
}

// ── Template generation ─────────────────────────────────────────────────────

function buildTemplate(
  collectionName: string,
  dbName: string,
  currentPipelineSource: string,
  simpleQuery: string,
  schemaMap: SchemaMap,
  sortField: string | null,
  sortDirection: 1 | -1,
): string {
  // Re-open existing pipeline as-is
  if (currentPipelineSource.trim()) {
    return currentPipelineSource
  }

  // Build $match from simple query if present
  let matchObj: Record<string, unknown> = {}
  if (simpleQuery.trim()) {
    try {
      matchObj = parseSimpleQuery(simpleQuery, schemaMap) as Record<string, unknown>
    } catch {
      matchObj = {}
    }
  }

  // Build $sort
  const sortObj = sortField
    ? { [sortField]: sortDirection }
    : { _id: -1 }

  // Compose as proper JSON (JSONC — supports // comments)
  // The $schema key must be first for jsonls to pick it up
  const doc = {
    $schema: "./.monq-pipeline-schema.json",
    pipeline: [
      { $match: matchObj },
      { $sort: sortObj },
    ],
  }

  // Pretty-print with helpful comments injected
  const topLevelFields = [...schemaMap.entries()]
    .filter(([p]) => !p.includes("."))

  const json = JSON.stringify(doc, null, 2)

  // Schema section: one line per field so AI agents can read the full schema
  const fieldLines = topLevelFields.length > 0
    ? topLevelFields.map(([p, info]) => `//   ${p}: ${info.type}`)
    : [`//   (no schema sampled)`]

  // Inject comment header and inline hints via string manipulation
  const header = [
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

  return header + json + "\n"
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
      $eq:        { description: "Equal to value" },
      $ne:        { description: "Not equal to value" },
      $gt:        { description: "Greater than value" },
      $gte:       { description: "Greater than or equal to value" },
      $lt:        { description: "Less than value" },
      $lte:       { description: "Less than or equal to value" },
      // Array membership
      $in:        { type: "array", description: "Matches any value in array", items: {} },
      $nin:       { type: "array", description: "Matches no value in array", items: {} },
      $all:       { type: "array", description: "Array contains all values", items: {} },
      // Existence / type
      $exists:    { type: "boolean", description: "true = field exists, false = field missing" },
      $type:      { description: "BSON type: string | number | bool | date | objectId | array | object | null | int | long | double | decimal" },
      // String / regex
      $regex:     { type: "string", description: "Regular expression pattern (e.g. \"^stefan\")" },
      $options:   { type: "string", description: "Regex flags: i (case-insensitive), m (multiline), s (dotAll), x (extended)" },
      // Array operators
      $elemMatch: { type: "object", description: "At least one array element matches all conditions", properties: {} },
      $size:      { type: "number", description: "Array has exactly N elements" },
      // Arithmetic
      $mod:       { type: "array", description: "[divisor, remainder] — value mod divisor = remainder", items: { type: "number" } },
      // Negation
      $not:       { type: "object", description: "Negates operator expression, e.g. { $not: { $gt: 5 } }", properties: {} },
    },
  }
}

function buildJsonSchema(collectionName: string, schemaMap: SchemaMap): string {
  // $match properties — top-level logical operators + per-field operators
  const matchProperties: Record<string, unknown> = {
    $and:  { type: "array", description: "All conditions must match", items: { type: "object" } },
    $or:   { type: "array", description: "At least one condition must match", items: { type: "object" } },
    $nor:  { type: "array", description: "No conditions match", items: { type: "object" } },
    $expr: { type: "object", description: "Aggregation expression in query context" },
    $text: {
      type: "object",
      description: "Full-text search",
      properties: {
        $search:        { type: "string", description: "Search string" },
        $language:      { type: "string", description: "Language for stemming" },
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
 * Build editor command args, positioning cursor inside the $match braces.
 *
 * For vim/nvim: use `+call cursor(line, col)` to place the cursor.
 * The target is the opening `{` of the $match value, one character in.
 *
 * For other editors: just open the file with no position args.
 */
function buildEditorArgs(editorBase: string, queryFile: string, content: string): string[] {
  const isVimLike = /^(nvim|vim|vi|gvim|view|rvim)$/.test(editorBase)

  if (!isVimLike) {
    return [editorBase, queryFile]
  }

  // Find the line containing "$match": { — we want the cursor on the
  // line after that (the first key inside $match), column 1.
  const lines = content.split("\n")
  let targetLine = 0
  let targetCol = 1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // Match the "$match" key line e.g.: `    { "$match": {`
    if (/"?\$match"?\s*:\s*\{/.test(line)) {
      // The opening brace is on this line — place cursor on next line, col 1
      // so user is ready to type the first field
      targetLine = i + 2  // 1-indexed, +1 for next line
      targetCol = 1
      // Try to find indentation of that next line for better positioning
      const nextLine = lines[i + 1] ?? ""
      const indent = nextLine.match(/^(\s*)/)?.[1].length ?? 0
      targetCol = indent + 1
      break
    }
  }

  if (targetLine === 0) {
    // Fallback: just open the file
    return [editorBase, queryFile]
  }

  // nvim/vim: `+call cursor(line, col)` positions cursor before loading
  return [editorBase, `+call cursor(${targetLine}, ${targetCol})`, queryFile]
}

// ── Main entry point ────────────────────────────────────────────────────────

/** Derive the stable pipeline file paths for a given tab */
export function pipelineFilePaths(dbName: string, collectionName: string, tabId: string) {
  const dir = join(tmpdir(), "monq", dbName, collectionName, tabId)
  return {
    dir,
    queryFile:  join(dir, "pipeline.jsonc"),
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
  simpleQuery: string
  schemaMap: SchemaMap
  sortField: string | null
  sortDirection: 1 | -1
}): Promise<string> {
  const {
    collectionName, dbName, tabId, pipelineSource, simpleQuery,
    schemaMap, sortField, sortDirection,
  } = params
  const { dir, queryFile, schemaFile } = pipelineFilePaths(dbName, collectionName, tabId)
  await mkdir(dir, { recursive: true })
  await Bun.write(schemaFile, buildJsonSchema(collectionName, schemaMap))
  const content = buildTemplate(collectionName, dbName, pipelineSource, simpleQuery, schemaMap, sortField, sortDirection)
  await Bun.write(queryFile, content)
  return queryFile
}

export async function openPipelineEditor(params: {
  collectionName: string
  dbName: string
  tabId: string
  pipelineSource: string
  simpleQuery: string
  schemaMap: SchemaMap
  sortField: string | null
  sortDirection: 1 | -1
}): Promise<PipelineResult | null> {
  const {
    collectionName, dbName, tabId, pipelineSource, simpleQuery,
    schemaMap, sortField, sortDirection,
  } = params

  // Stable temp dir scoped to db + collection + tab
  const { dir, queryFile, schemaFile } = pipelineFilePaths(dbName, collectionName, tabId)
  await mkdir(dir, { recursive: true })

  // Write schema sidecar
  await Bun.write(schemaFile, buildJsonSchema(collectionName, schemaMap))

  // Write initial content
  const template = buildTemplate(
    collectionName, dbName, pipelineSource, simpleQuery,
    schemaMap, sortField, sortDirection,
  )
  await Bun.write(queryFile, template)

  const editor = process.env.EDITOR || process.env.VISUAL || "vi"
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

    // Cancel if file is unchanged from what was on disk before opening
    // (user quit without saving — :q!)
    // We detect this by comparing the current file to what we last wrote
    const lastWritten = await Bun.file(queryFile).text().catch(() => "")
    // Actually we need to compare to the pre-edit content; simpler: if
    // content equals template the user cancelled from the initial template
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
      continue  // re-open editor
    }

    const pipeline: Document[] = Array.isArray(parsed.pipeline)
      ? parsed.pipeline
      : Array.isArray(parsed)
        ? parsed  // user wrote just a bare array
        : []

    if (pipeline.length === 0) {
      return null
    }

    const isAggregate = classifyPipeline(pipeline)
    return { pipeline, source: content, isAggregate }
  }
}
