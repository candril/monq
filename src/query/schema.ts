/**
 * Schema detection from document samples.
 * Builds a map of field paths -> types to support:
 * - Dot-notation suggestions (Members. -> Members.Name, Members.Email)
 * - Smart query generation ($elemMatch for arrays, dot-notation for objects)
 */

import type { Document } from "mongodb"

export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "object"
  | "array"
  | "objectid"
  | "date"
  | "mixed"

export interface FieldInfo {
  path: string
  type: FieldType
  /** Direct child field names (for objects and array-of-objects) */
  children: string[]
}

/** Schema map: field path -> FieldInfo */
export type SchemaMap = Map<string, FieldInfo>

/** Detect the type of a value */
function detectType(value: unknown): FieldType {
  if (value === null || value === undefined) return "null"
  if (typeof value === "string") return "string"
  if (typeof value === "number") return "number"
  if (typeof value === "boolean") return "boolean"
  if (value instanceof Date) return "date"
  if (typeof value === "object" && "_bsontype" in (value as object)) {
    const bson = (value as { _bsontype: string })._bsontype
    if (bson === "ObjectId" || bson === "ObjectID") return "objectid"
    if (bson === "Timestamp" || bson === "Date") return "date"
  }
  if (Array.isArray(value)) return "array"
  if (typeof value === "object") return "object"
  return "string"
}

const MAX_DEPTH = 3
const MAX_ARRAY_ITEMS = 5

/** Build a schema map from a sample of documents */
export function buildSchemaMap(documents: Document[]): SchemaMap {
  const map: SchemaMap = new Map()

  function walk(obj: Record<string, unknown>, prefix: string, parentPath: string, depth: number) {
    if (depth >= MAX_DEPTH) return

    for (const [key, value] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${key}` : key
      const type = detectType(value)

      const existing = map.get(path)
      if (existing) {
        // If types conflict, mark as mixed
        if (existing.type !== type && type !== "null") {
          existing.type = "mixed"
        }
      } else {
        map.set(path, { path, type, children: [] })
      }

      // Register as child of parent
      if (parentPath) {
        const parent = map.get(parentPath)
        if (parent && !parent.children.includes(key)) {
          parent.children.push(key)
        }
      }

      // Recurse into objects
      if (type === "object" && value !== null) {
        walk(value as Record<string, unknown>, path, path, depth + 1)
      }

      // Recurse into array-of-objects: sample up to MAX_ARRAY_ITEMS items.
      // If any item is a scalar the array is mixed/scalar — skip children entirely.
      if (type === "array" && Array.isArray(value) && value.length > 0) {
        const items = value.slice(0, MAX_ARRAY_ITEMS)
        const allObjects = items.every(
          (v) => v !== null && typeof v === "object" && !Array.isArray(v),
        )
        if (allObjects) {
          for (const item of items) {
            walk(item as Record<string, unknown>, path, path, depth + 1)
          }
        }
      }
    }
  }

  for (const doc of documents.slice(0, 50)) {
    walk(doc as Record<string, unknown>, "", "", 0)
  }

  // Sort children alphabetically
  for (const info of map.values()) {
    info.children.sort()
  }

  return map
}

/** Get suggestions for a field path prefix (e.g. "Members." -> ["Name", "Email"]) */
export function getSubfieldSuggestions(schema: SchemaMap, prefix: string): string[] {
  // Remove trailing dot
  const parentPath = prefix.endsWith(".") ? prefix.slice(0, -1) : prefix
  const parent = schema.get(parentPath)
  if (!parent) return []
  return parent.children
}

/** Check if a field path contains an array ancestor */
export function getArrayAncestor(schema: SchemaMap, fieldPath: string): string | null {
  const parts = fieldPath.split(".")
  let current = ""
  for (let i = 0; i < parts.length - 1; i++) {
    current = current ? `${current}.${parts[i]}` : parts[i]
    const info = schema.get(current)
    if (info && info.type === "array") {
      return current
    }
  }
  return null
}
