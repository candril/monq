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
  // If we already have a pipeline source, re-open it as-is
  if (currentPipelineSource.trim()) {
    return currentPipelineSource
  }

  // Build $match from simple query if present
  let matchContent = ""
  if (simpleQuery.trim()) {
    try {
      const filter = parseSimpleQuery(simpleQuery, schemaMap)
      matchContent = JSON.stringify(filter, null, 4)
        .split("\n")
        .map((l, i) => i === 0 ? l : `    ${l}`)
        .join("\n")
    } catch {
      matchContent = "{}"
    }
  } else {
    matchContent = "{}"
  }

  // Build $sort from active sort state if present
  const sortContent = sortField
    ? JSON.stringify({ [sortField]: sortDirection })
    : "{ _id: -1 }"

  // Field hints comment from schema
  const topFields = [...schemaMap.entries()]
    .filter(([p]) => !p.includes("."))
    .slice(0, 8)
    .map(([p, info]) => `${p}: ${info.type}`)
    .join(", ")
  const fieldHint = topFields ? `// Fields: ${topFields}` : ""

  return `// Mon-Q pipeline — ${collectionName} @ ${dbName}
// Edit and save (:wq) to apply. Quit without saving (:q!) to cancel.
// Ctrl+F opens this file again. F toggles the pipeline bar.
//
// $schema provides field completions if your editor supports jsonls.
${fieldHint}
{
  $schema: "./.monq-pipeline-schema.json",

  pipeline: [
    // $match: filter documents
    { $match: ${matchContent} },

    // $sort: 1 = asc, -1 = desc
    { $sort: ${sortContent} },

    // $project: include/exclude fields (remove stage for all fields)
    // { $project: { fieldName: 1, _id: 0 } },

    // Add more stages: $group, $lookup, $unwind, $limit, $addFields ...
  ],
}
`
}

// ── JSON Schema sidecar ─────────────────────────────────────────────────────

function buildJsonSchema(collectionName: string, schemaMap: SchemaMap): string {
  const typeMap: Record<string, string> = {
    string: "string",
    number: "number",
    boolean: "boolean",
    array: "array",
    object: "object",
    objectid: "string",
    date: "string",
    null: "null",
    mixed: "string",
  }

  // Build $match properties from top-level schema fields
  const matchProperties: Record<string, unknown> = {}
  for (const [path, info] of schemaMap) {
    if (path.includes(".")) continue
    matchProperties[path] = {
      description: `type: ${info.type}`,
      ...(typeMap[info.type] ? { type: typeMap[info.type] } : {}),
    }
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

// ── Main entry point ────────────────────────────────────────────────────────

export async function openPipelineEditor(params: {
  collectionName: string
  dbName: string
  pipelineSource: string
  simpleQuery: string
  schemaMap: SchemaMap
  sortField: string | null
  sortDirection: 1 | -1
}): Promise<PipelineResult | null> {
  const {
    collectionName, dbName, pipelineSource, simpleQuery,
    schemaMap, sortField, sortDirection,
  } = params

  // Stable temp dir per collection
  const dir = join(tmpdir(), "monq", collectionName)
  await mkdir(dir, { recursive: true })
  const queryFile  = join(dir, "pipeline.json5")
  const schemaFile = join(dir, ".monq-pipeline-schema.json")

  // Write schema sidecar
  await Bun.write(schemaFile, buildJsonSchema(collectionName, schemaMap))

  // Write (or re-open existing) pipeline file
  const template = buildTemplate(
    collectionName, dbName, pipelineSource, simpleQuery,
    schemaMap, sortField, sortDirection,
  )
  await Bun.write(queryFile, template)

  // Open in $EDITOR
  const editor = process.env.EDITOR || process.env.VISUAL || "vi"
  const proc = Bun.spawn([editor, queryFile], {
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

  // Cancel if unchanged (user quit without saving or saved identical content)
  if (content.trim() === template.trim()) {
    return null
  }

  // Parse JSON5
  let parsed: { pipeline?: Document[] }
  try {
    parsed = JSON5.parse(content)
  } catch (err) {
    throw new Error(`JSON5 parse error: ${(err as Error).message}`)
  }

  const pipeline: Document[] = Array.isArray(parsed.pipeline)
    ? parsed.pipeline
    : Array.isArray(parsed)
      ? parsed  // user may have written just an array
      : []

  if (pipeline.length === 0) {
    return null
  }

  const isAggregate = classifyPipeline(pipeline)

  return { pipeline, source: content, isAggregate }
}
