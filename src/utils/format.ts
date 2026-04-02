/**
 * Value formatting for document display.
 */

import { ObjectId } from "mongodb"
import { theme } from "../theme"
import type { JsonValueType } from "../types"

/** Detect the display type of a MongoDB value */
export function detectValueType(value: unknown): JsonValueType {
  if (value === null || value === undefined) {
    return "null"
  }
  if (typeof value === "string") {
    return "string"
  }
  if (typeof value === "number") {
    return "number"
  }
  if (typeof value === "boolean") {
    return "boolean"
  }
  if (value instanceof Date) {
    return "date"
  }
  if (value instanceof ObjectId) {
    return "objectid"
  }
  if (typeof value === "object" && "_bsontype" in (value as object)) {
    const bson = (value as { _bsontype: string })._bsontype
    if (bson === "ObjectId" || bson === "ObjectID") {
      return "objectid"
    }
    if (bson === "Timestamp" || bson === "Date") {
      return "date"
    }
  }
  if (Array.isArray(value)) {
    return "array"
  }
  if (typeof value === "object") {
    return "object"
  }
  return "string"
}

/** Get the theme color for a value type */
export function valueColor(type: JsonValueType): string {
  switch (type) {
    case "string":
      return theme.jsonString
    case "number":
      return theme.jsonNumber
    case "boolean":
      return theme.jsonBoolean
    case "null":
      return theme.jsonNull
    case "objectid":
      return theme.jsonObjectId
    case "date":
      return theme.jsonDate
    case "array":
      return theme.textDim
    case "object":
      return theme.textDim
  }
}

/** Format a value for display in a table cell */
export function formatValue(value: unknown, maxWidth: number): string {
  const type = detectValueType(value)

  let text: string
  switch (type) {
    case "null":
      text = "null"
      break
    case "boolean":
      text = String(value)
      break
    case "number":
      text = String(value)
      break
    case "string":
      text = value as string
      break
    case "objectid":
      text = String(value)
      break
    case "date": {
      const d = value instanceof Date ? value : new Date(String(value))
      text = d.toISOString().slice(0, 10)
      break
    }
    case "array":
      text = compactJson(value, maxWidth)
      break
    case "object":
      text = compactJson(value, maxWidth)
      break
    default:
      text = String(value)
  }

  return truncate(text, maxWidth)
}

/** Compact JSON representation that fits in maxWidth */
function compactJson(value: unknown, maxWidth: number): string {
  try {
    const json = JSON.stringify(value)
    if (json.length <= maxWidth) {
      return json
    }
    return truncate(json, maxWidth)
  } catch {
    return Array.isArray(value) ? `[${(value as unknown[]).length}]` : "{...}"
  }
}

/** Truncate string to maxWidth */
export function truncate(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) {
    return text
  }
  if (maxWidth <= 3) {
    return text.slice(0, maxWidth)
  }
  return text.slice(0, maxWidth - 1) + "~"
}

/** Pad string right to exact width */
export function padRight(text: string, width: number): string {
  if (text.length >= width) {
    return text.slice(0, width)
  }
  return text + " ".repeat(width - text.length)
}

/** Resolve the active sort field from pipeline stages or simple mode state */
export function resolveSortField(
  pipelineMode: boolean,
  pipeline: Array<Record<string, unknown>>,
  sortField: string | null,
): string | null {
  if (!pipelineMode) {
    return sortField
  }
  const sortStage = pipeline.find((s) => "$sort" in s)
  const entries = Object.entries((sortStage?.["$sort"] as Record<string, unknown>) ?? {})
  return entries.length === 1 ? entries[0][0] : null
}

/** Resolve the active sort direction from pipeline stages or simple mode state */
export function resolveSortDirection(
  pipelineMode: boolean,
  pipeline: Array<Record<string, unknown>>,
  sortDirection: 1 | -1,
): 1 | -1 {
  if (!pipelineMode) {
    return sortDirection
  }
  const sortStage = pipeline.find((s) => "$sort" in s)
  const entries = Object.entries((sortStage?.["$sort"] as Record<string, unknown>) ?? {})
  return entries.length === 1 ? (entries[0][1] as 1 | -1) : -1
}

/** Format the document count string shown in the header */
export function formatDocumentCount(
  loaded: number,
  filtered: number,
  total: number,
  hasFilter: boolean,
): string {
  if (loaded < filtered) {
    const range = `${loaded.toLocaleString()} of ${filtered.toLocaleString()}`
    return hasFilter ? `${range} | Total: ${total.toLocaleString()}` : range
  }
  return hasFilter
    ? `${filtered.toLocaleString()} of ${total.toLocaleString()}`
    : `${filtered.toLocaleString()} docs`
}

/** Return a human-readable summary of a document for confirm dialogs */
export function docSummary(doc: Record<string, unknown>): string {
  const LABEL_FIELDS = ["name", "title", "label", "email", "username", "slug", "key"]
  for (const field of LABEL_FIELDS) {
    const val = doc[field]
    if (val !== undefined && val !== null && typeof val !== "object") {
      return `${field}: ${String(val)}`
    }
  }
  for (const [key, val] of Object.entries(doc)) {
    if (key === "_id") {
      continue
    }
    if (val !== undefined && val !== null && typeof val !== "object") {
      return `${key}: ${String(val)}`
    }
  }
  return `_id: ${String(doc._id)}`
}

/** Compact JSON summary of an object, truncated to 60 chars */
export function summarise(obj: object): string {
  const s = JSON.stringify(obj)
  return s.length > 60 ? s.slice(0, 57) + "\u2026" : s
}

/** Convert a cell value to a copyable plain-text string */
export function formatCellValue(val: unknown): string {
  if (val === undefined || val === null) {
    return ""
  }
  if (typeof val === "object" && "toHexString" in val) {
    return (val as { toHexString(): string }).toHexString()
  }
  if (typeof val === "object") {
    return JSON.stringify(val, null, 2)
  }
  return String(val)
}

/** Resolve a dot-separated field path from a document object */
export function getNestedValue(doc: Record<string, unknown>, field: string): unknown {
  const parts = field.split(".")
  let current: unknown = doc
  for (const part of parts) {
    if (current === null || typeof current !== "object") {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}
