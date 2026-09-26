/**
 * Projection ↔ columns (spec 068).
 *
 * An inclusion projection names exactly the paths the user wants to see, so it
 * defines the columns directly: `+TvContract.Username` is the column
 * `TvContract.Username`, not the `TvContract` object MongoDB wraps it in.
 */

import type { Document } from "mongodb"
import { projectionToSimple } from "./parser"
import { tokenize } from "./tokenize"

export type Projection = Record<string, 0 | 1>

/**
 * Only 0/1 maps: a pipeline `$project` can compute fields (`{ x: "$a.b" }`),
 * and those don't name a path to show.
 */
function isPlainProjection(projection: Document | undefined): projection is Projection {
  return projection != null && Object.values(projection).every((v) => v === 0 || v === 1)
}

export function isInclusion(projection: Projection | undefined): boolean {
  return projection != null && Object.entries(projection).some(([k, v]) => k !== "_id" && v === 1)
}

/**
 * The columns an inclusion projection shows — `_id` first, then each included
 * path in the order it was written — or null for no or an exclusion projection.
 * `_id` stays in the list even when excluded; the loader hides it instead,
 * because the document still carries it for edit and delete.
 */
export function projectionColumns(projection: Document | undefined): string[] | null {
  if (!isPlainProjection(projection) || !isInclusion(projection)) {
    return null
  }
  const included = Object.entries(projection)
    .filter(([k, v]) => k !== "_id" && v === 1)
    .map(([k]) => k)
  return ["_id", ...included]
}

/** A bare `+field` or `-field` token — `-field:value` is a filter, not a projection. */
export function isProjectionToken(token: string): boolean {
  if (token.startsWith("+")) {
    return true
  }
  return token.startsWith("-") && !/[><!:]/.test(token.slice(1))
}

/** Swap the projection tokens of a simple query, leaving filters and search terms in place. */
export function replaceProjectionTokens(input: string, projection: Projection): string {
  const rest = tokenize(input.trim()).filter((token) => !isProjectionToken(token))
  const tokens = projectionToSimple(projection)
  return [...rest, ...(tokens ? [tokens] : [])].join(" ")
}
