/**
 * Pure document utilities — serialization and column detection.
 * No MongoDB driver dependency beyond types.
 */

import { EJSON } from "bson"
import type { Document } from "mongodb"

/** Serialize a document to strict EJSON (lossless, round-trippable) */
export function serializeDocument(doc: Document): string {
  return EJSON.stringify(doc, undefined, 2, { relaxed: false })
}

/** Serialize a document to relaxed EJSON for display (matches editor format) */
export function serializeDocumentRelaxed(doc: Document): string {
  return EJSON.stringify(doc, undefined, 2, { relaxed: true })
}

/** Deserialize EJSON string back to a document */
export function deserializeDocument(json: string): Document {
  return EJSON.deserialize(JSON.parse(json)) as Document
}

/** Walk a dot-notation path to retrieve a nested value from a document */
export function getNestedValue(doc: Document, fieldPath: string): unknown {
  const parts = fieldPath.split(".")
  let current: unknown = doc
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/** Collect distinct values for a field path from loaded documents (capped at `max`) */
export function sampleValues(documents: Document[], fieldPath: string, max = 20): unknown[] {
  const seen = new Set<string>()
  const result: unknown[] = []
  for (const doc of documents) {
    const val = getNestedValue(doc, fieldPath)
    if (val === undefined) {
      continue
    }
    // Use a string key for deduplication — handles ObjectId, Date, primitives
    const key =
      typeof val === "object" && val !== null && "_bsontype" in val
        ? String(val)
        : JSON.stringify(val)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(val)
    }
    if (result.length >= max) {
      break
    }
  }
  return result
}

/** Detect columns from a sample of documents, ordered by first-document field order.
 *  _id is always first. Fields only found in later documents are appended in discovery order.
 *  Sparse fields (below a frequency threshold) are excluded in large result sets. */
export function detectColumns(documents: Document[]): string[] {
  if (documents.length === 0) {
    return []
  }

  // Track insertion order and frequency
  const fieldOrder: string[] = []
  const fieldSet = new Set<string>()
  const fieldCounts = new Map<string, number>()

  for (const doc of documents) {
    for (const key of Object.keys(doc)) {
      if (!fieldSet.has(key)) {
        fieldSet.add(key)
        fieldOrder.push(key)
      }
      fieldCounts.set(key, (fieldCounts.get(key) ?? 0) + 1)
    }
  }

  // Threshold scales with result size: always show if present in small sets,
  // require ~10% presence for medium sets, capped at 5 for large sets (50+ docs).
  const threshold = Math.max(1, Math.min(documents.length * 0.1, 5))
  const filtered = fieldOrder.filter((field) => (fieldCounts.get(field) ?? 0) >= threshold)

  // Ensure _id is always first
  const idIdx = filtered.indexOf("_id")
  if (idIdx > 0) {
    filtered.splice(idIdx, 1)
    filtered.unshift("_id")
  }

  return filtered
}
