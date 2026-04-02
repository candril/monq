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

/** Detect columns from a sample of documents, sorted: _id first, scalars before complex, then alphabetically */
export function detectColumns(documents: Document[]): string[] {
  if (documents.length === 0) {
    return []
  }

  const fieldCounts = new Map<string, number>()
  const fieldIsComplex = new Map<string, boolean>()

  for (const doc of documents) {
    for (const [key, value] of Object.entries(doc)) {
      fieldCounts.set(key, (fieldCounts.get(key) ?? 0) + 1)
      // Mark as complex if any value is object/array (not null, not Date, not ObjectId)
      if (
        value !== null &&
        typeof value === "object" &&
        !(value instanceof Date) &&
        !((value as { _bsontype?: string })._bsontype === "ObjectId") &&
        !((value as { _bsontype?: string })._bsontype === "ObjectID")
      ) {
        fieldIsComplex.set(key, true)
      }
    }
  }

  // Threshold scales with result size: always show if present in small sets,
  // require ~10% presence for medium sets, capped at 5 for large sets (50+ docs).
  const threshold = Math.max(1, Math.min(documents.length * 0.1, 5))
  return [...fieldCounts.entries()]
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => {
      // _id always first
      if (a[0] === "_id") {
        return -1
      }
      if (b[0] === "_id") {
        return 1
      }
      // Scalars before complex
      const aComplex = fieldIsComplex.get(a[0]) ?? false
      const bComplex = fieldIsComplex.get(b[0]) ?? false
      if (aComplex !== bComplex) {
        return aComplex ? 1 : -1
      }
      // Alphabetically
      return a[0].localeCompare(b[0])
    })
    .map(([field]) => field)
}
