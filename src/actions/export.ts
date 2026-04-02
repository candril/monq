/**
 * Export current query/pipeline results to JSON or CSV file.
 *
 * Streams documents from MongoDB to a file with percentage-based progress
 * toasts. Supports cancellation via AbortController.
 */

import { EJSON } from "bson"
import type { Document } from "mongodb"
import type { Dispatch } from "react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { resolveCurrentQuery } from "../utils/query"
import { createFindCursor, createAggregateCursor, countForExport } from "../providers/mongodb"

export type ExportFormat = "json" | "csv"

// ── File path ────────────────────────────────────────────────────────────────

function exportFilePath(dbName: string, collectionName: string, format: ExportFormat): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  return `./${dbName}-${collectionName}-${ts}.${format}`
}

// ── CSV helpers ──────────────────────────────────────────────────────────────

const CSV_COLUMN_SCAN_SIZE = 100

/** Extract all dot-notation field paths from a document */
function extractPaths(doc: Document, prefix = ""): string[] {
  const paths: string[] = []
  for (const [key, value] of Object.entries(doc)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date) &&
      !("_bsontype" in value)
    ) {
      paths.push(...extractPaths(value as Document, path))
    } else {
      paths.push(path)
    }
  }
  return paths
}

/** Derive unique ordered column headers from a batch of documents */
function deriveColumns(docs: Document[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const doc of docs) {
    for (const path of extractPaths(doc)) {
      if (!seen.has(path)) {
        seen.add(path)
        ordered.push(path)
      }
    }
  }
  return ordered
}

/** Get a nested value by dot-notation path */
function getByPath(doc: Document, path: string): unknown {
  let current: unknown = doc
  for (const part of path.split(".")) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/** Flatten a BSON value to a plain string for CSV cells.
 *  ObjectId → hex, Date → ISO, Decimal128/Long → numeric string, etc. */
function flattenBsonValue(value: unknown): string | null {
  if (value === null || value === undefined || typeof value !== "object") {
    return null
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  const bsonObj = value as { _bsontype?: string }
  if (!bsonObj._bsontype) {
    return null
  }
  switch (bsonObj._bsontype) {
    case "ObjectId":
    case "ObjectID":
      return (value as { toHexString(): string }).toHexString()
    case "Date":
    case "Timestamp":
      return String(value)
    case "Decimal128":
    case "Long":
    case "Int32":
    case "Double":
      return (value as { toString(): string }).toString()
    case "Binary": {
      const bin = value as {
        sub_type?: number
        toUUID?(): { toString(): string }
        toString(): string
      }
      // UUID subtype (4) → UUID string, otherwise hex
      if (bin.sub_type === 4 && typeof bin.toUUID === "function") {
        return bin.toUUID().toString()
      }
      return bin.toString()
    }
    case "UUID":
      return (value as { toString(): string }).toString()
    default:
      return null
  }
}

/** Escape a CSV cell value */
function csvCell(value: unknown): string {
  if (value === undefined || value === null) {
    return ""
  }
  // Flatten known BSON types to readable strings
  const flat = flattenBsonValue(value)
  if (flat !== null) {
    return csvEscape(flat)
  }
  // Arrays and remaining objects → JSON
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    const json = EJSON.stringify(value, undefined, 0, { relaxed: true })
    return `"${json.replace(/"/g, '""')}"`
  }
  return csvEscape(String(value))
}

/** Escape a string for CSV (quote if needed) */
function csvEscape(str: string): string {
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/** Convert a document to a CSV row given column headers */
function docToCsvRow(doc: Document, columns: string[]): string {
  return columns.map((col) => csvCell(getByPath(doc, col))).join(",")
}

// ── Progress ─────────────────────────────────────────────────────────────────

const PROGRESS_INTERVAL_MS = 500

function progressMessage(exported: number, total: number, format: ExportFormat): string {
  if (total <= 0) {
    return `Exporting ${format.toUpperCase()}… ${exported} documents`
  }
  const pct = Math.min(100, Math.round((exported / total) * 100))
  const totalStr = String(total)
  const exportedStr = String(exported).padStart(totalStr.length)
  const pctStr = String(pct).padStart(3)
  return `Exporting ${format.toUpperCase()}…${pctStr}% (${exportedStr}/${totalStr})`
}

// ── Main export ──────────────────────────────────────────────────────────────

export interface ExportOptions {
  format: ExportFormat
  collectionName: string
  state: AppState
  dispatch: Dispatch<AppAction>
  signal: AbortSignal
  /** When set, export these docs directly instead of re-querying MongoDB */
  selectedDocs?: Document[]
}

export async function exportDocuments({
  format,
  collectionName,
  state,
  dispatch,
  signal,
  selectedDocs,
}: ExportOptions): Promise<void> {
  const filePath = exportFilePath(state.dbName, collectionName, format)

  if (selectedDocs && selectedDocs.length > 0) {
    await exportSelection({ selectedDocs, filePath, format, dispatch })
    return
  }

  const query = resolveCurrentQuery(state)

  // Get total count for progress
  dispatch({ type: "SHOW_MESSAGE", message: "Counting documents…", kind: "info" })
  let total: number
  try {
    total = await countForExport(collectionName, query)
  } catch {
    total = 0
  }

  if (signal.aborted) {
    return
  }

  if (total === 0) {
    dispatch({ type: "SHOW_MESSAGE", message: "No documents to export", kind: "warning" })
    return
  }

  // Open cursor
  const cursor =
    query.mode === "find"
      ? createFindCursor(collectionName, query.filter, {
          sort: query.sort,
          projection: query.projection,
        })
      : createAggregateCursor(collectionName, query.pipeline)

  const file = Bun.file(filePath)
  const writer = file.writer()

  let exported = 0
  let lastProgressAt = Date.now()

  dispatch({
    type: "SHOW_MESSAGE",
    message: progressMessage(0, total, format),
    kind: "info",
  })

  try {
    if (format === "json") {
      await exportJson(
        cursor,
        writer,
        total,
        format,
        signal,
        dispatch,
        () => exported++,
        () => {
          lastProgressAt = maybeUpdateProgress(exported, total, format, dispatch, lastProgressAt)
        },
      )
    } else {
      await exportCsv(
        cursor,
        writer,
        total,
        format,
        signal,
        dispatch,
        () => exported++,
        () => {
          lastProgressAt = maybeUpdateProgress(exported, total, format, dispatch, lastProgressAt)
        },
      )
    }
  } finally {
    await cursor.close()
    await writer.end()
  }

  if (signal.aborted) {
    // Clean up partial file
    try {
      const { unlink } = await import("fs/promises")
      await unlink(filePath)
    } catch {
      // ignore
    }
    dispatch({ type: "SHOW_MESSAGE", message: "Export cancelled", kind: "warning" })
    return
  }

  dispatch({
    type: "SHOW_MESSAGE",
    message: `Exported ${exported} documents to ${filePath}`,
    kind: "success",
  })
}

// ── Selection export (in-memory, no cursor) ─────────────────────────────────

async function exportSelection({
  selectedDocs,
  filePath,
  format,
  dispatch,
}: {
  selectedDocs: Document[]
  filePath: string
  format: ExportFormat
  dispatch: Dispatch<AppAction>
}): Promise<void> {
  const file = Bun.file(filePath)
  const writer = file.writer()

  try {
    if (format === "json") {
      writer.write("[\n")
      for (let i = 0; i < selectedDocs.length; i++) {
        if (i > 0) {
          writer.write(",\n")
        }
        writer.write(EJSON.stringify(selectedDocs[i], undefined, 2, { relaxed: true }))
      }
      writer.write("\n]\n")
    } else {
      const columns = deriveColumns(selectedDocs)
      writer.write(columns.map((c) => csvCell(c)).join(",") + "\n")
      for (const doc of selectedDocs) {
        writer.write(docToCsvRow(doc, columns) + "\n")
      }
    }
  } finally {
    await writer.end()
  }

  const n = selectedDocs.length
  dispatch({
    type: "SHOW_MESSAGE",
    message: `Exported ${n} selected document${n === 1 ? "" : "s"} to ${filePath}`,
    kind: "success",
  })
}

// ── JSON export ──────────────────────────────────────────────────────────────

async function exportJson(
  cursor: AsyncIterable<Document>,
  writer: ReturnType<ReturnType<typeof Bun.file>["writer"]>,
  total: number,
  format: ExportFormat,
  signal: AbortSignal,
  dispatch: Dispatch<AppAction>,
  incExported: () => void,
  tickProgress: () => void,
): Promise<void> {
  writer.write("[\n")
  let first = true
  for await (const doc of cursor) {
    if (signal.aborted) {
      break
    }
    if (!first) {
      writer.write(",\n")
    }
    first = false
    writer.write(EJSON.stringify(doc, undefined, 2, { relaxed: true }))
    incExported()
    tickProgress()
  }
  writer.write("\n]\n")
}

// ── CSV export ───────────────────────────────────────────────────────────────

async function exportCsv(
  cursor: AsyncIterable<Document>,
  writer: ReturnType<ReturnType<typeof Bun.file>["writer"]>,
  total: number,
  format: ExportFormat,
  signal: AbortSignal,
  dispatch: Dispatch<AppAction>,
  incExported: () => void,
  tickProgress: () => void,
): Promise<void> {
  // Buffer first batch to derive columns
  const buffer: Document[] = []
  let done = false

  const iter = cursor[Symbol.asyncIterator]()
  while (buffer.length < CSV_COLUMN_SCAN_SIZE) {
    if (signal.aborted) {
      return
    }
    const result = await iter.next()
    if (result.done) {
      done = true
      break
    }
    buffer.push(result.value)
  }

  if (buffer.length === 0) {
    return
  }

  const columns = deriveColumns(buffer)
  writer.write(columns.map((c) => csvCell(c)).join(",") + "\n")

  // Flush buffer
  for (const doc of buffer) {
    if (signal.aborted) {
      return
    }
    writer.write(docToCsvRow(doc, columns) + "\n")
    incExported()
    tickProgress()
  }

  // Stream rest
  if (!done) {
    while (true) {
      if (signal.aborted) {
        break
      }
      const result = await iter.next()
      if (result.done) {
        break
      }
      writer.write(docToCsvRow(result.value, columns) + "\n")
      incExported()
      tickProgress()
    }
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function maybeUpdateProgress(
  exported: number,
  total: number,
  format: ExportFormat,
  dispatch: Dispatch<AppAction>,
  lastProgressAt: number,
): number {
  const now = Date.now()
  if (now - lastProgressAt >= PROGRESS_INTERVAL_MS) {
    dispatch({
      type: "SHOW_MESSAGE",
      message: progressMessage(exported, total, format),
      kind: "info",
    })
    return now
  }
  return lastProgressAt
}
