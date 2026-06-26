/**
 * Restore BSON numeric types that relaxed-EJSON editing collapses to bare numbers.
 *
 * Relaxed EJSON renders `Int32`, `Long`, and `Double` as plain JSON numbers, so a
 * document edited as text loses the distinction between them. When such a number is
 * written back, the driver re-guesses the type (integer in int32 range -> `Int32`),
 * silently changing e.g. `Long(5)` into `Int32(5)`.
 *
 * `reconcileTypes` walks an edited value alongside its *raw* original (read with BSON
 * promotion disabled, so the original still carries true types) and re-applies the
 * original numeric type to each edited number. Fields the user genuinely changed keep
 * their column's type; untouched fields are restored verbatim (preserving exact value,
 * including big `Long`s beyond 2^53).
 */

import { Long, Int32, Double, Decimal128 } from "bson"

type BsonValue = { _bsontype?: string }

function bsonType(value: unknown): string | undefined {
  if (value !== null && typeof value === "object" && "_bsontype" in value) {
    return (value as BsonValue)._bsontype
  }
  return undefined
}

/** A BSON numeric wrapper whose type relaxed EJSON would have flattened to a number. */
function isBsonNumeric(value: unknown): boolean {
  const t = bsonType(value)
  return t === "Long" || t === "Int32" || t === "Double" || t === "Decimal128"
}

/** Re-apply `original`'s numeric BSON type to the plain `edited` number. */
function retypeNumber(edited: number, original: unknown): unknown {
  const t = bsonType(original)

  if (t === "Long") {
    if (!Number.isInteger(edited)) {
      // A fractional value can't be represented as Long — promote to Double.
      return new Double(edited)
    }
    // Unchanged value: return the original verbatim so big-int precision is kept.
    if (edited === (original as Long).toNumber()) {
      return original
    }
    return Long.fromNumber(edited)
  }

  if (t === "Int32") {
    return Number.isInteger(edited) ? new Int32(edited) : new Double(edited)
  }

  if (t === "Double") {
    // Keep Double even for integer-valued edits (e.g. 5.0 stays a double).
    return new Double(edited)
  }

  if (t === "Decimal128") {
    return Decimal128.fromString(String(edited))
  }

  // Original wasn't a typed number (plain number or non-numeric) — can't infer.
  return edited
}

/** True for a plain JS object we should recurse into (not array / Date / BSON wrapper). */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    bsonType(value) === undefined
  )
}

/**
 * Reconcile `edited` against `original`, restoring numeric BSON types lost during
 * relaxed-EJSON editing. Returns a new value; `original` is never mutated.
 *
 * - Plain number + numeric-typed original -> re-typed to the original's BSON type.
 * - Edited value already a BSON wrapper (explicit user EJSON) -> honored as-is.
 * - Arrays -> reconciled element-wise by index.
 * - Plain objects -> reconciled per key; keys absent from the original are kept as-is.
 * - Everything else (string, boolean, null, Date, ObjectId, ...) -> kept as-is.
 */
export function reconcileTypes(edited: unknown, original: unknown): unknown {
  // The user wrote an explicit BSON wrapper — respect their intent.
  if (bsonType(edited) !== undefined) {
    return edited
  }

  if (typeof edited === "number" && isBsonNumeric(original)) {
    return retypeNumber(edited, original)
  }

  if (Array.isArray(edited)) {
    const origArr = Array.isArray(original) ? original : []
    return edited.map((item, i) => reconcileTypes(item, origArr[i]))
  }

  if (isPlainObject(edited)) {
    const origObj = isPlainObject(original) ? original : undefined
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(edited)) {
      result[key] = reconcileTypes(value, origObj?.[key])
    }
    return result
  }

  return edited
}

/** Reconcile a document's fields, preserving the (already-typed) `_id` from the original. */
export function reconcileDocument(
  edited: Record<string, unknown>,
  original: Record<string, unknown>,
): Record<string, unknown> {
  return reconcileTypes(edited, original) as Record<string, unknown>
}
