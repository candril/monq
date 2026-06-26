/**
 * Stable, order-insensitive serialization for comparing documents.
 *
 * Used to decide (a) whether a user actually changed a document and (b) whether the
 * stored document drifted from what the user saw (a remote/concurrent change). Keys
 * are sorted deeply so field-order differences never read as a change.
 */

import { EJSON } from "bson"

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep)
  }
  if (!value || typeof value !== "object") {
    return value
  }
  const record = value as Record<string, unknown>
  const sortedEntries = Object.keys(record)
    .sort()
    .map((key) => [key, sortKeysDeep(record[key])] as const)
  return Object.fromEntries(sortedEntries)
}

/**
 * Serialize a value to a stable string with sorted keys.
 *
 * - `relaxed: false` (canonical) distinguishes numeric BSON types (Long vs Int32 vs
 *   Double) — use it to detect whether the *exact* document changed, types included.
 * - `relaxed: true` collapses numeric types to bare numbers — use it for *value*
 *   conflict detection, where a remote Long→Int32 of the same value is not a conflict.
 */
export function stableEjson(value: unknown, opts: { relaxed: boolean }): string {
  return JSON.stringify(sortKeysDeep(EJSON.serialize(value, { relaxed: opts.relaxed })))
}

/** True if two documents are equal by value (ignoring numeric BSON type and key order). */
export function sameByValue(a: unknown, b: unknown): boolean {
  return stableEjson(a, { relaxed: true }) === stableEjson(b, { relaxed: true })
}

/** True if two documents are exactly equal, including numeric BSON types and key order. */
export function sameCanonical(a: unknown, b: unknown): boolean {
  return stableEjson(a, { relaxed: false }) === stableEjson(b, { relaxed: false })
}
