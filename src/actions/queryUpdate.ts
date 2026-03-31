/**
 * Bulk query update / delete — open $EDITOR with a filter template,
 * count matching documents, and run updateMany or deleteMany.
 */

import { tmpdir } from "os"
import { join } from "path"
import { mkdir } from "fs/promises"
import JSON5 from "json5"
import type { Document, Filter } from "mongodb"
import { updateManyDocuments, countDocuments, deleteManyDocuments } from "../providers/mongodb"
import { getEditor, ERROR_COMMENT_RE } from "../utils/editor"
import type { SchemaMap } from "../query/schema"

// ── Temp dir ─────────────────────────────────────────────────────────────────

async function getTempDir(collectionName: string): Promise<string> {
  const dir = join(tmpdir(), "monq", collectionName)
  await mkdir(dir, { recursive: true })
  return dir
}

// ── Update operator JSON Schema ───────────────────────────────────────────────

/** Convert a schemaMap field type to a JSON Schema value schema. */
function fieldTypeToSchema(path: string, schemaMap: SchemaMap): object {
  const info = schemaMap.get(path)
  if (!info) return {}
  switch (info.type) {
    case "string":
      return { type: "string" }
    case "number":
      return { type: "number" }
    case "boolean":
      return { type: "boolean" }
    case "null":
      return { type: "null" }
    case "objectid":
    case "date":
      return { type: "object" }
    case "mixed":
      return {}
    case "object":
    case "array":
      return {}
  }
}

function generateUpdateSchema(collectionName: string, schemaMap?: SchemaMap): object {
  // All known field paths (including dot-notation) with type info
  const setProperties: Record<string, object> = {}
  const unsetProperties: Record<string, object> = {}
  const incProperties: Record<string, object> = {}
  const filterProperties: Record<string, object> = {}

  if (schemaMap) {
    for (const path of schemaMap.keys()) {
      const typeSchema = fieldTypeToSchema(path, schemaMap)
      // $set: every field with its value type
      setProperties[path] = { ...typeSchema, description: `Set ${path}` }
      // $unset: every field, value must be ""
      unsetProperties[path] = { type: "string", const: "", description: `Unset ${path}` }
      // $inc: only numeric fields
      const info = schemaMap.get(path)
      if (info?.type === "number") {
        incProperties[path] = { type: "number", description: `Increment ${path}` }
      }
      // filter: top-level only
      if (!path.includes(".")) {
        filterProperties[path] = typeSchema
      }
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
        properties: setProperties,
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
        properties: unsetProperties,
        additionalProperties: { type: "string", const: "" },
        examples: [{ obsoleteField: "" }, { "tags.$.tmp": "" }],
      },
      $inc: {
        type: "object",
        description: "Increment numeric fields by the given amount (negative to decrement).",
        properties: incProperties,
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
        description:
          "Set field to current date. Use true or { $type: 'date' } or { $type: 'timestamp' }.",
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
        properties: setProperties,
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

/** Returns true if every operator in the update object is an empty {} */
function isUpdateEmpty(update: Document): boolean {
  const keys = Object.keys(update)
  if (keys.length === 0) return true
  return keys.every((k) => {
    const v = update[k]
    return (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      Object.keys(v as object).length === 0
    )
  })
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

export interface QueryUpdateEmpty {
  cancelled: false
  emptyUpdate: true
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
): Promise<QueryUpdateResult | QueryUpdateEmpty | QueryUpdateReady> {
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
      if (!next || stripComments(stripErrorComment(next)) === "" || next.trim() === content.trim())
        return { cancelled: true }
      content = next
    }
  }

  const { filter, update, upsert } = parsed

  // Bail out early if the update has no actual field operations
  if (isUpdateEmpty(update)) return { cancelled: false, emptyUpdate: true }

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

// ── Bulk query delete ─────────────────────────────────────────────────────────

function buildDeleteHeader(collectionName: string, dbName: string): string {
  return [
    `// Monq — bulk delete · ${collectionName} @ ${dbName}`,
    `// Edit "filter", then save (:wq) to preview and confirm. Quit without saving (:q!) to cancel.`,
    `//`,
    `// All documents matching the filter will be PERMANENTLY DELETED.`,
    `//`,
    ``,
  ].join("\n")
}

function generateFilterSchema(collectionName: string, schemaMap?: SchemaMap): object {
  const filterProperties: Record<string, object> = {}
  if (schemaMap) {
    for (const path of schemaMap.keys()) {
      if (path.includes(".")) continue
      filterProperties[path] = {}
    }
  }
  return {
    $schema: "http://json-schema.org/draft-07/schema",
    title: `Monq bulk delete — ${collectionName}`,
    type: "object",
    required: ["filter"],
    properties: {
      $schema: { type: "string" },
      filter: {
        type: "object",
        description: "MongoDB filter — all documents matching this will be deleted.",
        properties: filterProperties,
        additionalProperties: true,
      },
    },
    additionalProperties: false,
  }
}

export interface QueryDeleteResult {
  cancelled: true
}

export interface QueryDeleteReady {
  cancelled: false
  collectionName: string
  filter: Filter<Document>
  matchedCount: number
  apply: () => Promise<{ deletedCount: number }>
}

export async function openEditorForQueryDelete(
  collectionName: string,
  dbName: string,
  activeFilter: Filter<Document>,
  schemaMap?: SchemaMap,
): Promise<QueryDeleteResult | QueryDeleteReady> {
  const dir = await getTempDir(collectionName)
  const tmpFile = join(dir, "delete.jsonc")
  const schemaFile = join(dir, "delete-schema.json")

  await Bun.write(
    schemaFile,
    JSON.stringify(generateFilterSchema(collectionName, schemaMap), null, 2),
  )

  const templateObj = {
    $schema: schemaFile,
    filter: activeFilter,
  }
  const body = JSON.stringify(templateObj, null, 2)
  const header = buildDeleteHeader(collectionName, dbName)

  await Bun.write(tmpFile, header + body)

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
  let filter: Filter<Document>
  while (true) {
    const clean = stripComments(stripErrorComment(content))
    if (clean === "") return { cancelled: true }
    try {
      const raw = JSON5.parse(clean) as Record<string, unknown>
      if (typeof raw !== "object" || raw === null) throw new Error("Expected a JSON object")
      filter = (raw.filter ?? {}) as Filter<Document>
      break
    } catch (err) {
      const next = await openEditorWithError(tmpFile, content, (err as Error).message)
      if (!next || stripComments(stripErrorComment(next)) === "" || next.trim() === content.trim())
        return { cancelled: true }
      content = next
    }
  }

  const matchedCount = await countDocuments(collectionName, filter)

  return {
    cancelled: false,
    collectionName,
    filter,
    matchedCount,
    apply: () => deleteManyDocuments(collectionName, filter),
  }
}
