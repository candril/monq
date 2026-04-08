/**
 * Mark token helpers — used by the `'<letter>` keyboard shortcut to write a
 * mark filter into whichever query mode is currently active.
 *
 * Three modes, three semantics:
 *
 *   • Simple mode  → toggle a textual `@<letter>` token in the query string.
 *                    Live: ids resolve at query time, so newly-marked docs
 *                    show up on reload.
 *
 *   • BSON mode    → set `_id: { $in: [<ObjectIds>] }` inside the parsed
 *                    bsonFilter object, then re-serialise. Snapshot: the
 *                    ObjectIds are concrete at the moment `'d` is pressed.
 *
 *   • Pipeline mode → set `_id: { $in: [...] }` inside the first `$match`
 *                     stage (or prepend a new `$match` stage). Snapshot.
 *
 * All helpers are pure — no React, no state, no async I/O. The keyboard
 * handler does the dispatching.
 */

import type { Document } from "mongodb"
import { EJSON } from "bson"

// ── Simple mode ─────────────────────────────────────────────────────────────

const ANY_MARK_TOKEN = /(?:^|\s)@[a-z](?=\s|$)/g

/**
 * Toggle `@<letter>` in a simple-mode query string. If present anywhere in
 * the query, the matching token is removed; otherwise it's appended at the
 * end. Other tokens are preserved verbatim. Returns the new query string.
 */
export function toggleMarkToken(query: string, letter: string): string {
  const target = `@${letter}`
  // Split into tokens (whitespace-separated, no quoting concerns since
  // mark tokens can't contain spaces).
  const tokens = query.split(/\s+/).filter(Boolean)
  const idx = tokens.indexOf(target)
  if (idx >= 0) {
    tokens.splice(idx, 1)
    return tokens.join(" ")
  }
  tokens.push(target)
  return tokens.join(" ")
}

/**
 * Remove any `@<letter>` token from a simple-mode query string. Used by `''`
 * which doesn't know which letter is currently active. If no mark token is
 * present, the query is returned unchanged.
 */
export function removeAnyMarkToken(query: string): string {
  return query
    .replace(ANY_MARK_TOKEN, (match) => (match.startsWith(" ") ? "" : ""))
    .replace(/\s+/g, " ")
    .trim()
}

// ── BSON mode ───────────────────────────────────────────────────────────────

/**
 * Set `_id: { $in: ids }` in an EJSON-encoded BSON filter, returning the new
 * pretty-printed string. Other top-level keys are preserved.
 *
 * Uses EJSON (not plain JSON) so ObjectId values round-trip correctly: an
 * ObjectId becomes `{"$oid":"..."}`, which `parseBsonQuery` deserialises
 * back to a real `ObjectId` instance the driver can match against.
 *
 * Returns null when the input can't be parsed — the caller should toast
 * "fix the BSON filter first" rather than silently destroying user input.
 */
export function mergeMarkIntoBson(bsonFilter: string, idsLiteral: unknown[]): string | null {
  const trimmed = bsonFilter.trim()
  // Empty filter is fine — start fresh with just the _id constraint.
  if (!trimmed || trimmed === "{}") {
    return EJSON.stringify({ _id: { $in: idsLiteral } } as never, undefined, 2)
  }
  let parsed: unknown
  try {
    parsed = EJSON.parse(trimmed)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null
  }
  const next = { ...(parsed as Record<string, unknown>), _id: { $in: idsLiteral } }
  return EJSON.stringify(next as never, undefined, 2)
}

/**
 * Drop the `_id` key from an EJSON-encoded BSON filter. Returns the empty
 * string when nothing remains, or null if the input is unparseable (caller
 * decides whether to ignore or toast).
 */
export function removeIdFromBson(bsonFilter: string): string | null {
  const trimmed = bsonFilter.trim()
  if (!trimmed) {
    return ""
  }
  let parsed: unknown
  try {
    parsed = EJSON.parse(trimmed)
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return null
  }
  const obj = { ...(parsed as Record<string, unknown>) }
  if (!("_id" in obj)) {
    return bsonFilter
  }
  delete obj._id
  if (Object.keys(obj).length === 0) {
    return ""
  }
  return EJSON.stringify(obj as never, undefined, 2)
}

// ── Pipeline mode ───────────────────────────────────────────────────────────

/**
 * Set `_id: { $in: ids }` inside the first `$match` stage of a pipeline. If
 * no `$match` stage exists, prepends a new one. Returns the new pipeline as
 * a fresh array — the input is not mutated.
 */
export function mergeMarkIntoPipeline(pipeline: Document[], idsLiteral: unknown[]): Document[] {
  const matchIdx = pipeline.findIndex((s) => "$match" in s)
  if (matchIdx === -1) {
    return [{ $match: { _id: { $in: idsLiteral } } }, ...pipeline]
  }
  return pipeline.map((stage, i) => {
    if (i !== matchIdx) {
      return stage
    }
    const existingMatch = (stage as { $match: Document }).$match ?? {}
    return { $match: { ...existingMatch, _id: { $in: idsLiteral } } }
  })
}

/**
 * Drop `_id` from the first `$match` stage. If that leaves the stage empty,
 * the whole `$match` stage is removed. Returns a fresh array.
 */
export function removeIdFromPipeline(pipeline: Document[]): Document[] {
  const matchIdx = pipeline.findIndex((s) => "$match" in s)
  if (matchIdx === -1) {
    return pipeline
  }
  const matchStage = pipeline[matchIdx] as { $match: Document }
  if (!("_id" in (matchStage.$match ?? {}))) {
    return pipeline
  }
  const nextMatch = { ...(matchStage.$match ?? {}) }
  delete (nextMatch as Record<string, unknown>)._id
  if (Object.keys(nextMatch).length === 0) {
    return pipeline.filter((_, i) => i !== matchIdx)
  }
  return pipeline.map((stage, i) => (i === matchIdx ? { $match: nextMatch } : stage))
}
