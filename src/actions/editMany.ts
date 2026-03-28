import { tmpdir } from "os"
import { join } from "path"
import { mkdir } from "fs/promises"
import { EJSON } from "bson"
import type { Document } from "mongodb"
import { replaceDocument, insertDocument, deleteDocument } from "../providers/mongodb"
import type { SchemaMap, FieldType } from "../query/schema"

export interface EditManyResult {
  updated: number
  unchanged: number
  missing: Document[]
  added: Document[]
  errors: string[]
}

export type EditManyConfirmAction = "ignore" | "delete" | "insert"

function docIdKey(doc: Document): string | null {
  if (doc._id === undefined || doc._id === null) return null
  return typeof (doc._id as any).toHexString === "function"
    ? (doc._id as any).toHexString()
    : String(doc._id)
}

async function getTempDir(collectionName: string): Promise<string> {
  const dir = join(tmpdir(), "monq", collectionName)
  await mkdir(dir, { recursive: true })
  return dir
}

function serializeArray(docs: Document[], schemaPath?: string): string {
  const serialized = EJSON.stringify(docs, undefined, 2, { relaxed: true })
  if (!schemaPath) return serialized
  const parsed = JSON.parse(serialized)
  const wrapped = { $schema: schemaPath, documents: parsed }
  return JSON.stringify(wrapped, null, 2)
}

function parseArray(json: string): Document[] {
  const raw = JSON.parse(json)
  const arr = Array.isArray(raw) ? raw : raw.documents
  if (!Array.isArray(arr)) throw new Error("Expected a JSON array or { documents: [...] }")
  return arr.map((item: unknown) => EJSON.deserialize(item as Parameters<typeof EJSON.deserialize>[0]) as Document)
}

const FIELD_TYPE_TO_JSON_SCHEMA: Record<FieldType, object> = {
  string: { type: "string" }, number: { type: "number" }, boolean: { type: "boolean" },
  null: { type: "null" }, object: { type: "object" }, array: { type: "array" },
  objectid: { type: "object" }, date: { type: "object" }, mixed: {},
}

function generateSchema(collectionName: string, schemaMap: SchemaMap): object {
  const properties: Record<string, object> = {}
  for (const [path, info] of schemaMap) {
    if (path.includes(".")) continue
    properties[path] = FIELD_TYPE_TO_JSON_SCHEMA[info.type] ?? {}
  }
  return {
    $schema: "http://json-schema.org/draft-07/schema",
    title: `Mon-Q documents — ${collectionName}`,
    type: "object",
    properties: { documents: { type: "array", items: { type: "object", properties } } },
  }
}

export async function openEditorForMany(
  collectionName: string,
  originalDocs: Document[],
  editorDocs?: Document[],
  schemaMap?: SchemaMap,
): Promise<{ cancelled: true } | { cancelled: false; result: EditManyResult; editedDocs: Document[]; applyEdits: () => Promise<void> }> {
  const dir = await getTempDir(collectionName)
  const tmpFile = join(dir, "edit.json")
  const schemaFile = join(dir, ".monq-docs-schema.json")

  if (schemaMap && schemaMap.size > 0) {
    await Bun.write(schemaFile, JSON.stringify(generateSchema(collectionName, schemaMap), null, 2))
  }

  const schemaRelPath = schemaMap && schemaMap.size > 0 ? "./.monq-docs-schema.json" : undefined
  const editorSeed = serializeArray(editorDocs ?? originalDocs, schemaRelPath)
  const originalSerialized = serializeArray(originalDocs, schemaRelPath)

  await Bun.write(tmpFile, editorSeed)

  const editor = process.env.EDITOR || process.env.VISUAL || "vi"
  const proc = Bun.spawn([editor, tmpFile], { stdin: "inherit", stdout: "inherit", stderr: "inherit" })
  await proc.exited

  let edited: string
  try { edited = await Bun.file(tmpFile).text() } catch { return { cancelled: true } }

  if (edited.trim() === originalSerialized.trim()) {
    return { cancelled: false, result: { updated: 0, unchanged: originalDocs.length, missing: [], added: [], errors: [] }, editedDocs: originalDocs, applyEdits: async () => {} }
  }

  let editedDocs: Document[]
  try {
    editedDocs = parseArray(edited)
  } catch (err) {
    return { cancelled: false, result: { updated: 0, unchanged: 0, missing: [], added: [], errors: [`Parse error: ${(err as Error).message}`] }, editedDocs: originalDocs, applyEdits: async () => {} }
  }

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
    if (!key) { added.push(editedDoc); continue }
    seenKeys.add(key)
    const orig = originalById.get(key)
    if (!orig) { added.push(editedDoc); continue }
    const { _id: _a, ...origFields } = orig
    const { _id: _b, ...editedFields } = editedDoc
    const origJson = EJSON.stringify(origFields, undefined, 0, { relaxed: true })
    const editedJson = EJSON.stringify(editedFields, undefined, 0, { relaxed: true })
    if (origJson === editedJson) { unchanged.push(editedDoc) } else { toReplace.push({ originalId: orig._id, newDoc: editedFields }) }
  }

  const missing: Document[] = []
  for (const [key, doc] of originalById) {
    if (!seenKeys.has(key)) missing.push(doc)
  }

  const result: EditManyResult = { updated: toReplace.length, unchanged: unchanged.length, missing, added, errors }

  const applyEdits = async () => {
    for (const { originalId, newDoc } of toReplace) {
      try { await replaceDocument(collectionName, originalId, newDoc) }
      catch (err) { result.errors.push(`Replace failed for ${String(originalId)}: ${(err as Error).message}`) }
    }
  }

  return { cancelled: false, result, editedDocs, applyEdits }
}

export async function openEditorForInsert(
  collectionName: string,
  templateDoc?: Document,
  schemaMap?: SchemaMap,
): Promise<{ cancelled: true } | { cancelled: false; inserted: number; errors: string[] }> {
  const dir = await getTempDir(collectionName)
  const tmpFile = join(dir, "insert.json")
  const schemaFile = join(dir, ".monq-docs-schema.json")

  if (schemaMap && schemaMap.size > 0) {
    await Bun.write(schemaFile, JSON.stringify(generateSchema(collectionName, schemaMap), null, 2))
  }

  const template = templateDoc ? buildTemplate(templateDoc) : {}
  const schemaRelPath = schemaMap && schemaMap.size > 0 ? "./.monq-docs-schema.json" : undefined
  const content = serializeArray([template], schemaRelPath)
  await Bun.write(tmpFile, content)

  const editor = process.env.EDITOR || process.env.VISUAL || "vi"
  const proc = Bun.spawn([editor, tmpFile], { stdin: "inherit", stdout: "inherit", stderr: "inherit" })
  await proc.exited

  let edited: string
  try { edited = await Bun.file(tmpFile).text() } catch { return { cancelled: true } }
  if (edited.trim() === content.trim()) return { cancelled: false, inserted: 0, errors: [] }

  let newDocs: Document[]
  try { newDocs = parseArray(edited) }
  catch (err) { return { cancelled: false, inserted: 0, errors: [`Parse error: ${(err as Error).message}`] } }

  const errors: string[] = []
  let inserted = 0
  for (const doc of newDocs) {
    try { const { _id: _, ...docWithoutId } = doc; await insertDocument(collectionName, docWithoutId); inserted++ }
    catch (err) { errors.push(`Insert failed: ${(err as Error).message}`) }
  }
  return { cancelled: false, inserted, errors }
}

function buildTemplate(doc: Document): Document {
  const result: Document = {}
  for (const [key, value] of Object.entries(doc)) {
    if (key === "_id") continue
    if (value === null) { result[key] = null; continue }
    if (typeof value === "string") { result[key] = ""; continue }
    if (typeof value === "number") { result[key] = 0; continue }
    if (typeof value === "boolean") { result[key] = false; continue }
    if (Array.isArray(value)) { result[key] = []; continue }
    if (typeof value === "object") { result[key] = buildTemplate(value as Document); continue }
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
      try { await deleteDocument(collectionName, doc._id) }
      catch (err) { errors.push(`Delete failed for ${String(doc._id)}: ${(err as Error).message}`) }
    }
  }
  if (addedAction === "insert") {
    for (const doc of result.added) {
      try { const { _id: _, ...docWithoutId } = doc; await insertDocument(collectionName, docWithoutId) }
      catch (err) { errors.push(`Insert failed: ${(err as Error).message}`) }
    }
  }
  return errors
}
