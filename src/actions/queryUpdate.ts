/**
 * Bulk query update — open $EDITOR with a filter+update JSONC template,
 * parse the result, count matching documents, and run updateMany.
 */

import { tmpdir } from "os"
import { join } from "path"
import { mkdir } from "fs/promises"
import JSON5 from "json5"
import type { Document, Filter } from "mongodb"
import { updateManyDocuments, countDocuments } from "../providers/mongodb"
import { getEditor, ERROR_COMMENT_RE } from "../utils/editor"
import type { SchemaMap } from "../query/schema"

// ── Temp dir ─────────────────────────────────────────────────────────────────

async function getTempDir(collectionName: string): Promise<string> {
  const dir = join(tmpdir(), "monq", collectionName)
  await mkdir(dir, { recursive: true })
  return dir
}

// ── Update operator JSON Schema ───────────────────────────────────────────────

function generateUpdateSchema(collectionName: string, schemaMap?: SchemaMap): object {
  // Build filter properties from schemaMap field names
  const filterProperties: Record<string, object> = {}
  if (schemaMap) {
    for (const path of schemaMap.keys()) {
      if (path.includes(".")) continue
      filterProperties[path] = {}
    }
  }

  const anyValue = { description: "Any value" }

  const updateOperatorSchema = {
    type: "object",
    description: "MongoDB update expression. Use one or more update operators.",
    properties: {
      $set: {
        type: "object",
        description:
          "Set field values. Keys support dot-notation and the positional operator " +
          '("array.$.field") to update the element matched by $elemMatch in the filter.',
        additionalProperties: anyValue,
        examples: [
          { status: "active" },
          { "tags.$.status": "done" },
          { "address.city": "Berlin", score: 10 },
        ],
      },
      $unset: {
        type: "object",
        description:
          'Remove fields. Use "" as the value. Supports dot-notation and positional "array.$.field".',
        additionalProperties: { type: "string", const: "" },
        examples: [{ obsoleteField: "" }, { "tags.$.tmp": "" }],
      },
      $inc: {
        type: "object",
        description: "Increment numeric fields by the given amount (negative to decrement).",
        additionalProperties: { type: "number" },
        examples: [{ score: 1 }, { views: -1 }],
      },
      $mul: {
        type: "object",
        description: "Multiply numeric fields by the given factor.",
        additionalProperties: { type: "number" },
        examples: [{ price: 1.1 }],
      },
      $min: {
        type: "object",
        description: "Update field only if the new value is less than the current value.",
        additionalProperties: anyValue,
      },
      $max: {
        type: "object",
        description: "Update field only if the new value is greater than the current value.",
        additionalProperties: anyValue,
      },
      $rename: {
        type: "object",
        description: "Rename fields. Value is the new field name.",
        additionalProperties: { type: "string" },
        examples: [{ oldName: "newName" }],
      },
      $push: {
        type: "object",
        description:
          "Append a value to an array field. Use $each modifier to push multiple values.",
        additionalProperties: anyValue,
        examples: [{ tags: "new-tag" }, { scores: { $each: [1, 2, 3] } }],
      },
      $pull: {
        type: "object",
        description: "Remove all elements from an array that match the given condition.",
        additionalProperties: anyValue,
        examples: [{ tags: "old-tag" }, { scores: { $lt: 0 } }],
      },
      $addToSet: {
        type: "object",
        description: "Add a value to an array only if it is not already present.",
        additionalProperties: anyValue,
        examples: [{ tags: "unique-tag" }],
      },
      $currentDate: {
        type: "object",
        description: "Set field to current date. Use true or { $type: 'date' } or { $type: 'timestamp' }.",
        additionalProperties: {
          oneOf: [
            { type: "boolean" },
            {
              type: "object",
              properties: { $type: { type: "string", enum: ["date", "timestamp"] } },
            },
          ],
        },
        examples: [{ updatedAt: true }, { updatedAt: { $type: "date" } }],
      },
      $setOnInsert: {
        type: "object",
        description:
          "Set fields only when upserting creates a new document (ignored on matched updates).",
        additionalProperties: anyValue,
        examples: [{ createdAt: { $date: "2024-01-01T00:00:00Z" } }],
      },
    },
    additionalProperties: false,
    examples: [
      {
        $set: { status: "done", "tags.$.resolved": true },
        $currentDate: { updatedAt: true },
      },
    ],
  }

  return {
    $schema: "http://json-schema.org/draft-07/schema",
    title: `Monq bulk update — ${collectionName}`,
    type: "object",
    required: ["filter", "update"],
    properties: {
      $schema: { type: "string" },
      filter: {
        type: "object",
        description: "MongoDB filter — documents matching this will be updated.",
        properties: filterProperties,
        additionalProperties: true,
      },
      update: updateOperatorSchema,
      upsert: {
        type: "boolean",
        description:
          "If true, insert a new document when no documents match the filter. " +
          "Use $setOnInsert in the update to set fields only on insert.",
        default: false,
      },
    },
    additionalProperties: false,
    examples: [
      {
        filter: { status: "pending" },
        update: { $set: { status: "done" }, $currentDate: { updatedAt: true } },
        upsert: false,
      },
      {
        filter: { tags: { $elemMatch: { status: "pending" } } },
        update: { $set: { "tags.$.status": "done" } },
        upsert: false,
      },
    ],
  }
}

// ── Header ────────────────────────────────────────────────────────────────────

function buildHeader(collectionName: string, dbName: string): string {
  return [
    `// Monq — bulk update · ${collectionName} @ ${dbName}`,
    `// Edit "update", then save (:wq) to preview and confirm. Quit without saving (:q!) to cancel.`,
    `//`,
    `// Operators: $set $unset $inc $mul $min $max $rename $push $pull $addToSet $currentDate $setOnInsert`,
    `// Positional: use "array.$.field" in $set/$unset to update the element matched by $elemMatch in filter`,
    `// Tip: set "upsert": true to insert a new document when no match — use $setOnInsert for insert-only fields`,
    `//`,
    ``,
  ].join("\n")
}

// ── Parse helpers ─────────────────────────────────────────────────────────────

function stripComments(content: string): string {
  return content.replace(/^\/\/.*$/gm, "").trim()
}

function stripErrorComment(content: string): string {
  return content.replace(ERROR_COMMENT_RE, "")
}

export interface ParsedQueryUpdate {
  filter: Filter<Document>
  update: Document
  upsert: boolean
}

function parseTemplate(json: string): ParsedQueryUpdate {
  const clean = stripComments(json)
  const raw = JSON5.parse(clean) as Record<string, unknown>
  if (typeof raw !== "object" || raw === null) throw new Error("Expected a JSON object")
  const filter = (raw.filter ?? {}) as Filter<Document>
  const update = raw.update as Document
  if (!update || typeof update !== "object")
    throw new Error('Missing or invalid "update" key — must be a MongoDB update operator object')
  const upsert = raw.upsert === true
  return { filter, update, upsert }
}

// ── Error retry ───────────────────────────────────────────────────────────────

async function openEditorWithError(
  tmpFile: string,
  content: string,
  errorMsg: string,
): Promise<string | null> {
  const errorComment = `// !! PARSE ERROR: ${errorMsg}\n// Fix the JSON below and save, or delete all content to cancel.\n\n`
  await Bun.write(tmpFile, errorComment + stripErrorComment(content))
  const editor = getEditor()
  const proc = Bun.spawn([editor, tmpFile], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  await proc.exited
  if (proc.exitCode !== 0) return null
  try {
    return await Bun.file(tmpFile).text()
  } catch {
    return null
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export interface QueryUpdateResult {
  cancelled: true
}

export interface QueryUpdateReady {
  cancelled: false
  collectionName: string
  filter: Filter<Document>
  update: Document
  upsert: boolean
  matchedCount: number
  apply: () => Promise<{ matchedCount: number; modifiedCount: number; upsertedCount: number }>
}

export async function openEditorForQueryUpdate(
  collectionName: string,
  dbName: string,
  activeFilter: Filter<Document>,
  schemaMap?: SchemaMap,
): Promise<QueryUpdateResult | QueryUpdateReady> {
  const dir = await getTempDir(collectionName)
  const tmpFile = join(dir, "update.jsonc")
  const schemaFile = join(dir, "update-schema.json")

  // Write schema sidecar
  await Bun.write(
    schemaFile,
    JSON.stringify(generateUpdateSchema(collectionName, schemaMap), null, 2),
  )

  // Build template body
  const templateObj = {
    $schema: schemaFile,
    filter: activeFilter,
    update: { $set: {} },
    upsert: false,
  }
  const body = JSON.stringify(templateObj, null, 2)
  const header = buildHeader(collectionName, dbName)

  await Bun.write(tmpFile, header + body)

  // Open editor
  const editor = getEditor()
  const proc = Bun.spawn([editor, tmpFile], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  await proc.exited
  if (proc.exitCode !== 0) return { cancelled: true }

  let content: string
  try {
    content = await Bun.file(tmpFile).text()
  } catch {
    return { cancelled: true }
  }

  // Parse loop with error retry
  let parsed: ParsedQueryUpdate
  while (true) {
    const clean = stripComments(stripErrorComment(content))
    if (clean === "") return { cancelled: true }
    try {
      parsed = parseTemplate(clean)
      break
    } catch (err) {
      const next = await openEditorWithError(tmpFile, content, (err as Error).message)
      if (
        !next ||
        stripComments(stripErrorComment(next)) === "" ||
        next.trim() === content.trim()
      )
        return { cancelled: true }
      content = next
    }
  }

  const { filter, update, upsert } = parsed

  // Count matching documents before showing confirm dialog
  const matchedCount = await countDocuments(collectionName, filter)

  return {
    cancelled: false,
    collectionName,
    filter,
    update,
    upsert,
    matchedCount,
    apply: () => updateManyDocuments(collectionName, filter, update, { upsert }),
  }
}
