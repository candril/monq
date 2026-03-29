import { tmpdir } from "os"
import { join } from "path"
import { mkdir } from "fs/promises"
import { EJSON } from "bson"
import JSON5 from "json5"
import type { Document } from "mongodb"
import { replaceDocument, insertDocument, deleteDocument } from "../providers/mongodb"
import { getEditor, ERROR_COMMENT_RE } from "../utils/editor"
import type { SchemaMap } from "../query/schema"

export interface EditManyResult {
  updated: number
  unchanged: number
  missing: Document[]
  added: Document[]
  errors: string[]
}

export type EditManyConfirmAction = "ignore" | "delete" | "insert"

type MaybeObjectId = { toHexString?: () => string }

function docIdKey(doc: Document): string | null {
  if (doc._id === undefined || doc._id === null) return null
  const id = doc._id as MaybeObjectId
  return typeof id.toHexString === "function" ? id.toHexString() : String(doc._id)
}

async function getTempDir(collectionName: string): Promise<string> {
  const dir = join(tmpdir(), "monq", collectionName)
  await mkdir(dir, { recursive: true })
  return dir
}

// ── Schema sidecar ───────────────────────────────────────────────────────────

function fieldToJsonSchema(path: string, schemaMap: SchemaMap): object {
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
    case "object": {
      const properties: Record<string, object> = {}
      for (const child of info.children) {
        properties[child] = fieldToJsonSchema(`${path}.${child}`, schemaMap)
      }
      return { type: "object", properties }
    }
    case "array": {
      if (info.children.length === 0) return { type: "array" }
      // array-of-objects: build items schema from children
      const itemProperties: Record<string, object> = {}
      for (const child of info.children) {
        itemProperties[child] = fieldToJsonSchema(`${path}.${child}`, schemaMap)
      }
      return { type: "array", items: { type: "object", properties: itemProperties } }
    }
  }
}

function generateSchema(collectionName: string, schemaMap: SchemaMap): object {
  const properties: Record<string, object> = {}
  for (const path of schemaMap.keys()) {
    if (path.includes(".")) continue
    properties[path] = fieldToJsonSchema(path, schemaMap)
  }
  return {
    $schema: "http://json-schema.org/draft-07/schema",
    title: `Monq documents — ${collectionName}`,
    type: "object",
    properties: { documents: { type: "array", items: { type: "object", properties } } },
  }
}

// ── Header builders ───────────────────────────────────────────────────────────

function buildSchemaLines(collectionName: string, schemaMap?: SchemaMap): string[] {
  const allFields = schemaMap ? [...schemaMap.entries()] : []
  const fieldLines =
    allFields.length > 0
      ? [
          ...allFields.slice(0, 10).map(([p, info]) => `//   ${p}: ${info.type}`),
          ...(allFields.length > 10 ? [`//   … and ${allFields.length - 10} more fields`] : []),
        ]
      : [`//   (no schema sampled)`]
  return [`// Schema (${collectionName}):`, ...fieldLines, `//`]
}

function buildEditHeader(
  collectionName: string,
  dbName: string,
  docCount: number,
  schemaMap?: SchemaMap,
): string {
  return [
    `// Monq — bulk editing ${docCount} document${docCount === 1 ? "" : "s"} in ${collectionName} @ ${dbName}`,
    `// Save to apply (:wq). Quit without saving (:q!) to cancel.`,
    `//`,
    `// Rules:`,
    `//   • Edit field values freely — changes are saved on quit`,
    `//   • Removing a document from the array marks it as "missing" (triggers confirm)`,
    `//   • Adding a new object (without an existing _id) marks it as "added" (triggers confirm)`,
    `//   • _id values are used to match documents — do not change them`,
    `//`,
    ...buildSchemaLines(collectionName, schemaMap),
    ``,
  ].join("\n")
}

function buildInsertHeader(collectionName: string, dbName: string, schemaMap?: SchemaMap): string {
  return [
    `// Monq — inserting into ${collectionName} @ ${dbName}`,
    `// Save to apply (:wq). Quit without saving (:q!) to cancel.`,
    `//`,
    `// Rules:`,
    `//   • Each object in the array will be inserted as a new document`,
    `//   • Omit _id — MongoDB will auto-generate one`,
    `//   • Add more objects to insert multiple documents at once`,
    `//`,
    ...buildSchemaLines(collectionName, schemaMap),
    ``,
  ].join("\n")
}

// ── Serialization ─────────────────────────────────────────────────────────────

function serializeArray(docs: Document[], schemaPath?: string): string {
  const serialized = EJSON.stringify(docs, undefined, 2, { relaxed: true })
  if (!schemaPath) return serialized
  const parsed = JSON.parse(serialized)
  const wrapped = { $schema: schemaPath, documents: parsed }
  return JSON.stringify(wrapped, null, 2)
}

function stripComments(content: string): string {
  // Remove full-line comments (// ...) only — preserve inline strings
  return content.replace(/^\/\/.*$/gm, "").trim()
}

function parseArray(json: string): Document[] {
  const clean = stripComments(json)
  const raw = JSON5.parse(clean)
  const arr = Array.isArray(raw) ? raw : raw.documents
  if (!Array.isArray(arr)) throw new Error("Expected a JSON array or { documents: [...] }")
  return arr.map(
    (item: unknown) =>
      EJSON.deserialize(item as Parameters<typeof EJSON.deserialize>[0]) as Document,
  )
}

// ── Error handling ────────────────────────────────────────────────────────────

function stripErrorComment(content: string): string {
  return content.replace(ERROR_COMMENT_RE, "")
}

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

// ── Diff logic ───────────────────────────────────────────────────────────────

export interface DiffResult {
  result: EditManyResult
  toReplace: Array<{ originalId: unknown; newDoc: Document }>
}

/**
 * Pure diff: compare originalDocs against editedDocs by _id.
 * Returns which docs to update, which are missing, and which are new (added).
 * No DB calls — purely structural comparison.
 */
export function diffDocs(originalDocs: Document[], editedDocs: Document[]): DiffResult {
  const originalById = new Map<string, Document>()
  for (const doc of originalDocs) {
    const key = docIdKey(doc)
    if (key) originalById.set(key, doc)
  }

  const toReplace: Array<{ originalId: unknown; newDoc: Document }> = []
  const added: Document[] = []
  const unchanged: Document[] = []
  const errors: string[] = []
  const seenKeys = new Set<string>()

  for (const editedDoc of editedDocs) {
    const key = docIdKey(editedDoc)
    if (!key) {
      added.push(editedDoc)
      continue
    }
    seenKeys.add(key)
    const orig = originalById.get(key)
    if (!orig) {
      added.push(editedDoc)
      continue
    }
    const { _id: _a, ...origFields } = orig
    const { _id: _b, ...editedFields } = editedDoc
    const origJson = EJSON.stringify(origFields, undefined, 0, { relaxed: true })
    const editedJson = EJSON.stringify(editedFields, undefined, 0, { relaxed: true })
    if (origJson === editedJson) {
      unchanged.push(editedDoc)
    } else {
      toReplace.push({ originalId: orig._id, newDoc: editedFields })
    }
  }

  const missing: Document[] = []
  for (const [key, doc] of originalById) {
    if (!seenKeys.has(key)) missing.push(doc)
  }

  return {
    result: { updated: toReplace.length, unchanged: unchanged.length, missing, added, errors },
    toReplace,
  }
}

// ── Main entry points ─────────────────────────────────────────────────────────

export async function openEditorForMany(
  collectionName: string,
  dbName: string,
  originalDocs: Document[],
  editorDocs?: Document[],
  schemaMap?: SchemaMap,
): Promise<
  | { cancelled: true }
  | {
      cancelled: false
      result: EditManyResult
      editedDocs: Document[]
      applyEdits: () => Promise<void>
    }
> {
  const dir = await getTempDir(collectionName)
  const tmpFile = join(dir, "edit.jsonc")
  const schemaFile = join(dir, ".monq-docs-schema.json")

  if (schemaMap && schemaMap.size > 0) {
    await Bun.write(schemaFile, JSON.stringify(generateSchema(collectionName, schemaMap), null, 2))
  }

  const schemaRelPath = schemaMap && schemaMap.size > 0 ? "./.monq-docs-schema.json" : undefined
  const docsToEdit = editorDocs ?? originalDocs
  const bodyContent = serializeArray(docsToEdit, schemaRelPath)
  const originalSerialized = serializeArray(originalDocs, schemaRelPath)

  const header = buildEditHeader(collectionName, dbName, docsToEdit.length, schemaMap)
  await Bun.write(tmpFile, header + bodyContent)

  const editor = getEditor()
  const proc = Bun.spawn([editor, tmpFile], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  await proc.exited

  if (proc.exitCode !== 0) return { cancelled: true }

  let edited: string
  try {
    edited = await Bun.file(tmpFile).text()
  } catch {
    return { cancelled: true }
  }

  // Strip header comments to get just the JSON body for comparison
  const editedBody = stripComments(stripErrorComment(edited))
  if (editedBody === stripComments(originalSerialized)) {
    return {
      cancelled: false,
      result: { updated: 0, unchanged: originalDocs.length, missing: [], added: [], errors: [] },
      editedDocs: originalDocs,
      applyEdits: async () => {},
    }
  }

  let editedDocs: Document[]
  // Retry loop: re-open editor on parse error with an inline error comment
  while (true) {
    const clean = stripComments(stripErrorComment(edited))
    if (clean === "") return { cancelled: true }
    try {
      editedDocs = parseArray(clean)
      break
    } catch (err) {
      const next = await openEditorWithError(tmpFile, edited, (err as Error).message)
      if (!next || stripComments(stripErrorComment(next)) === "" || next.trim() === edited.trim())
        return { cancelled: true }
      edited = next
    }
  }

  const { result, toReplace } = diffDocs(originalDocs, editedDocs)

  const applyEdits = async () => {
    for (const { originalId, newDoc } of toReplace) {
      try {
        await replaceDocument(collectionName, originalId, newDoc)
      } catch (err) {
        result.errors.push(`Replace failed for ${String(originalId)}: ${(err as Error).message}`)
      }
    }
  }

  return { cancelled: false, result, editedDocs, applyEdits }
}

export async function openEditorForInsert(
  collectionName: string,
  dbName: string,
  templateDoc?: Document,
  schemaMap?: SchemaMap,
): Promise<{ cancelled: true } | { cancelled: false; inserted: number; errors: string[] }> {
  const dir = await getTempDir(collectionName)
  const tmpFile = join(dir, "insert.jsonc")
  const schemaFile = join(dir, ".monq-docs-schema.json")

  if (schemaMap && schemaMap.size > 0) {
    await Bun.write(schemaFile, JSON.stringify(generateSchema(collectionName, schemaMap), null, 2))
  }

  const template = templateDoc ? buildTemplate(templateDoc) : {}
  const schemaRelPath = schemaMap && schemaMap.size > 0 ? "./.monq-docs-schema.json" : undefined
  const bodyContent = serializeArray([template], schemaRelPath)
  const header = buildInsertHeader(collectionName, dbName, schemaMap)

  const initialContent = header + bodyContent
  await Bun.write(tmpFile, initialContent)

  const editor = getEditor()
  const proc = Bun.spawn([editor, tmpFile], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  await proc.exited

  if (proc.exitCode !== 0) return { cancelled: true }

  let edited: string
  try {
    edited = await Bun.file(tmpFile).text()
  } catch {
    return { cancelled: true }
  }

  const editedBody = stripComments(stripErrorComment(edited))
  if (editedBody === stripComments(bodyContent))
    return { cancelled: false, inserted: 0, errors: [] }

  let newDocs: Document[]
  // Retry loop: re-open editor on parse error with an inline error comment
  while (true) {
    const clean = stripComments(stripErrorComment(edited))
    if (clean === "") return { cancelled: true }
    try {
      newDocs = parseArray(clean)
      break
    } catch (err) {
      const next = await openEditorWithError(tmpFile, edited, (err as Error).message)
      if (!next || stripComments(stripErrorComment(next)) === "" || next.trim() === edited.trim())
        return { cancelled: true }
      edited = next
    }
  }

  const errors: string[] = []
  let inserted = 0
  for (const doc of newDocs) {
    try {
      const { _id: _, ...docWithoutId } = doc
      await insertDocument(collectionName, docWithoutId)
      inserted++
    } catch (err) {
      errors.push(`Insert failed: ${(err as Error).message}`)
    }
  }
  return { cancelled: false, inserted, errors }
}

function buildTemplate(doc: Document): Document {
  const result: Document = {}
  for (const [key, value] of Object.entries(doc)) {
    if (key === "_id") continue
    if (value === null) {
      result[key] = null
      continue
    }
    if (typeof value === "string") {
      result[key] = ""
      continue
    }
    if (typeof value === "number") {
      result[key] = 0
      continue
    }
    if (typeof value === "boolean") {
      result[key] = false
      continue
    }
    if (Array.isArray(value)) {
      result[key] = []
      continue
    }
    if (typeof value === "object") {
      result[key] = buildTemplate(value as Document)
      continue
    }
    result[key] = value
  }
  return result
}

export async function applyConfirmActions(
  collectionName: string,
  result: EditManyResult,
  missingAction: EditManyConfirmAction,
  addedAction: EditManyConfirmAction,
): Promise<string[]> {
  const errors: string[] = []
  if (missingAction === "delete") {
    for (const doc of result.missing) {
      try {
        await deleteDocument(collectionName, doc._id)
      } catch (err) {
        errors.push(`Delete failed for ${String(doc._id)}: ${(err as Error).message}`)
      }
    }
  }
  if (addedAction === "insert") {
    for (const doc of result.added) {
      try {
        const { _id: _, ...docWithoutId } = doc
        await insertDocument(collectionName, docWithoutId)
      } catch (err) {
        errors.push(`Insert failed: ${(err as Error).message}`)
      }
    }
  }
  return errors
}
