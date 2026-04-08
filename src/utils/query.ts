/**
 * Shared helper to resolve the current query from app state.
 * Used by both useDocumentLoader and the explain action
 * to reconstruct the same filter/sort/projection/pipeline.
 */

import type { Document, Filter } from "mongodb"
import type { AppState } from "../types"
import { parseSimpleQueryFull, parseBsonQuery, type MarkIdMap } from "../query/parser"
import { classifyPipeline, extractFindParts } from "../query/pipeline"
import { decodeMarkId, lettersInScope, idsForLetter } from "./marks"

/**
 * Build the `@<letter>` resolver map for the current active tab. Each used
 * letter in the active (host, db, col) scope maps to its decoded `_id`s,
 * ready to drop into a Mongo `_id: { $in: [...] }` filter.
 *
 * Returns an empty map when there's no active tab (so `@a` resolves to
 * "matches nothing", which is the safest default).
 */
export function buildMarkIdMap(state: AppState): MarkIdMap {
  const map: MarkIdMap = new Map()
  // Defensive against partial state shapes (e.g. test mocks): if any required
  // field is missing, return an empty map so `@<letter>` resolves to "no marks".
  if (!Array.isArray(state.tabs) || !Array.isArray(state.marks)) {
    return map
  }
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
  if (!activeTab) {
    return map
  }
  const scope = { host: state.host, db: state.dbName, col: activeTab.collectionName }
  for (const letter of lettersInScope(state.marks, scope).keys()) {
    map.set(letter, idsForLetter(state.marks, scope, letter).map(decodeMarkId))
  }
  return map
}

export type ResolvedQuery =
  | {
      mode: "find"
      filter: Filter<Document>
      sort?: Record<string, 1 | -1>
      projection?: Record<string, 0 | 1>
    }
  | {
      mode: "aggregate"
      pipeline: Document[]
    }

export function resolveCurrentQuery(state: AppState): ResolvedQuery {
  // Pipeline mode
  if (state.pipelineMode && state.pipeline.length > 0) {
    const isAggregate = classifyPipeline(state.pipeline)
    if (isAggregate) {
      return { mode: "aggregate", pipeline: state.pipeline }
    }
    // Find-compatible pipeline
    const { filter, sort, projection } = extractFindParts(state.pipeline)
    return { mode: "find", filter, sort, projection }
  }

  // Simple / BSON filter mode
  let filter: Filter<Document> = {}
  let projection: Record<string, 0 | 1> | undefined
  try {
    if (state.queryInput.trim()) {
      if (state.queryMode === "bson") {
        filter = parseBsonQuery(state.queryInput)
      } else {
        const parsed = parseSimpleQueryFull(
          state.queryInput,
          state.schemaMap,
          buildMarkIdMap(state),
        )
        filter = parsed.filter
        projection = parsed.projection
      }
    }
  } catch {
    // Invalid query — use empty filter
  }

  // Sort
  let sort: Record<string, 1 | -1> | undefined
  if (state.queryMode === "bson" && state.bsonSort.trim()) {
    try {
      sort = JSON.parse(state.bsonSort)
    } catch {
      /* skip */
    }
  } else if (state.sortField) {
    sort = { [state.sortField]: state.sortDirection as 1 | -1 }
  }

  // BSON projection
  if (state.queryMode === "bson" && state.bsonProjection.trim()) {
    try {
      projection = JSON.parse(state.bsonProjection)
    } catch {
      /* skip */
    }
  }

  return { mode: "find", filter, sort, projection }
}

/**
 * Resolve just the active filter from app state.
 * In pipeline mode, extracts the $match stage filter.
 * Used by bulk update/delete actions that operate on the query filter.
 */
export function resolveActiveFilter(state: AppState): Filter<Document> {
  const query = resolveCurrentQuery(state)
  if (query.mode === "find") {
    return query.filter
  }
  // Aggregate pipeline — extract $match filter if present
  const { filter } = extractFindParts(query.pipeline)
  return filter
}
