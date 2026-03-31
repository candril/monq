/**
 * Hook: Load documents when active tab changes or query is submitted.
 * Parses the query string and passes filter to fetchDocuments.
 */

import { useEffect } from "react"
import type { Dispatch } from "react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { fetchDocuments, fetchAggregate, explainFind, explainAggregate } from "../providers/mongodb"
import { detectColumns } from "../utils/document"
import { parseSimpleQueryFull, parseBsonQuery } from "../query/parser"
import { buildSchemaMap } from "../query/schema"
import { classifyPipeline, extractFindParts } from "../query/pipeline"
import { resolveCurrentQuery } from "../utils/query"

/**
 * Strip `_id: 0` from a projection before sending to MongoDB.
 * _id must always be fetched so edit/delete commands can find the document.
 * Returns the sanitized projection and whether _id was suppressed.
 */
function sanitizeProjection(projection: Record<string, 0 | 1> | undefined): {
  projection: Record<string, 0 | 1> | undefined
  idHidden: boolean
} {
  if (!projection) return { projection, idHidden: false }
  if (!("_id" in projection) || projection["_id"] !== 0) {
    return { projection, idHidden: false }
  }
  const { _id: _, ...rest } = projection
  return {
    projection: Object.keys(rest).length > 0 ? (rest as Record<string, 0 | 1>) : undefined,
    idHidden: true,
  }
}

interface UseDocumentLoaderOptions {
  state: AppState
  dispatch: Dispatch<AppAction>
  pageSize: number
}

export function useDocumentLoader({ state, dispatch, pageSize }: UseDocumentLoaderOptions) {
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
  const { documentsLoading, reloadCounter, queryInput, queryMode } = state

  // Effect 1: initial load / reload (triggered by documentsLoading + reloadCounter)
  useEffect(() => {
    if (!activeTab || !documentsLoading) return

    let cancelled = false
    const existingColumns = state.columns

    // Pipeline mode — aggregate or find-compatible pipeline
    if (state.pipelineMode && state.pipeline.length > 0) {
      const isAggregate = classifyPipeline(state.pipeline)

      // Only preserve existing columns when the pipeline is purely filter/sort
      // ($match and $sort only). Any stage that reshapes documents — $project,
      // $group, $addFields, $lookup, $unwind, $replaceRoot, etc. — must start
      // fresh so the column list reflects the actual output shape.
      const SHAPE_PRESERVING = new Set(["$match", "$sort"])
      const pipelinePreservesShape = state.pipeline.every((stage) =>
        SHAPE_PRESERVING.has(Object.keys(stage)[0]),
      )

      let pipelineIdHidden = false
      const fetchPipeline = isAggregate
        ? fetchAggregate(activeTab.collectionName, state.pipeline, { limit: pageSize })
        : (() => {
            const { filter, sort, projection: rawProjection } = extractFindParts(state.pipeline)
            const { projection: safeProjection, idHidden } = sanitizeProjection(rawProjection)
            pipelineIdHidden = idHidden
            return fetchDocuments(activeTab.collectionName, filter, {
              sort,
              projection: safeProjection,
              limit: pageSize,
            })
          })()

      fetchPipeline
        .then(({ documents, count }) => {
          if (cancelled) return
          const detectedFields = detectColumns(documents)
          const detectedSet = new Set(detectedFields)

          let columns
          if (pipelinePreservesShape) {
            // Merge: keep existing display modes, preserve columns not in this page
            const existingByField = new Map(existingColumns.map((c) => [c.field, c]))
            const newColumns = detectedFields.map((field) => {
              const existing = existingByField.get(field)
              return (
                existing ?? { field, frequency: 1, visible: true, displayMode: "normal" as const }
              )
            })
            const preserved = existingColumns.filter((c) => !detectedSet.has(c.field))
            columns = [...newColumns, ...preserved]
          } else {
            // Pipeline reshapes documents — detect fresh from results only
            columns = detectedFields.map((field) => ({
              field,
              frequency: 1,
              visible: true,
              displayMode: "normal" as const,
            }))
          }

          // If _id was excluded from the projection, hide it in the column list
          // but the document data still contains _id so edits work correctly.
          if (pipelineIdHidden) {
            columns = columns.map((c) => (c.field === "_id" ? { ...c, visible: false } : c))
          }

          dispatch({ type: "SET_DOCUMENTS", documents, count, totalCount: count })
          dispatch({ type: "SET_COLUMNS", columns })
          dispatch({ type: "SET_SCHEMA", schemaMap: buildSchemaMap(documents) })
        })
        .catch((err: Error) => {
          if (cancelled) return
          // In watch mode, pipeline errors are non-fatal — show a toast so the
          // user can fix the file and the watcher will retry. Outside watch mode
          // use the full error screen.
          if (state.pipelineWatching) {
            dispatch({
              type: "SHOW_MESSAGE",
              message: `Pipeline error: ${err.message}`,
              kind: "error",
            })
          } else {
            dispatch({ type: "SET_ERROR", error: err.message })
          }
        })

      return () => {
        cancelled = true
      }
    }

    // Simple / BSON filter mode
    let filter = {}
    let projection: Record<string, 0 | 1> | undefined
    try {
      if (queryInput.trim()) {
        if (queryMode === "bson") {
          filter = parseBsonQuery(queryInput)
        } else {
          const parsed = parseSimpleQueryFull(queryInput, state.schemaMap)
          filter = parsed.filter
          projection = parsed.projection
        }
      }
    } catch {
      // Invalid query — fetch unfiltered
    }

    // Sort: bson mode uses bsonSort textarea, simple mode uses sortField
    let sort: Record<string, 1 | -1> | undefined
    if (queryMode === "bson" && state.bsonSort.trim()) {
      try {
        sort = JSON.parse(state.bsonSort)
      } catch {
        /* skip */
      }
    } else if (state.sortField) {
      sort = { [state.sortField]: state.sortDirection as 1 | -1 }
    }

    // BSON mode projection: uses bsonProjection textarea
    if (queryMode === "bson" && state.bsonProjection.trim()) {
      try {
        projection = JSON.parse(state.bsonProjection)
      } catch {
        /* skip */
      }
    }

    // Always fetch _id so edit/delete commands work; hide it in the column list
    // if the user explicitly excluded it via projection.
    const { projection: safeProjection, idHidden } = sanitizeProjection(projection)

    fetchDocuments(activeTab.collectionName, filter, {
      sort,
      projection: safeProjection,
      limit: pageSize,
    })
      .then(({ documents, count, totalCount }) => {
        if (cancelled) return
        const detectedFields = detectColumns(documents)
        const detectedSet = new Set(detectedFields)

        // Preserve display modes for existing columns, add new ones as "normal"
        const existingByField = new Map(existingColumns.map((c) => [c.field, c]))
        const newColumns = detectedFields.map((field) => {
          const existing = existingByField.get(field)
          return existing ?? { field, frequency: 1, visible: true, displayMode: "normal" as const }
        })

        // When a simple-mode projection is active, don't preserve columns that
        // were excluded or are outside the inclusion set — they weren't fetched
        // and would show as null in every row.
        // Use the original projection (with _id: 0) for the column visibility logic
        // so that _id is treated as "excluded" for column preservation purposes.
        const hasSimpleProjection = queryMode === "simple" && projection != null
        const proj = hasSimpleProjection ? projection! : null
        const exclusions = proj
          ? new Set(
              Object.entries(proj)
                .filter(([, v]) => v === 0)
                .map(([k]) => k),
            )
          : null
        const inclusions =
          proj && Object.values(proj).some((v) => v === 1)
            ? new Set(
                Object.entries(proj)
                  .filter(([, v]) => v === 1)
                  .map(([k]) => k),
              )
            : null

        const preserved = existingColumns.filter((c) => {
          if (detectedSet.has(c.field)) return false // already in newColumns
          if (exclusions?.has(c.field)) return false // explicitly excluded
          if (inclusions && !inclusions.has(c.field)) return false // not included
          return true
        })
        let columns = [...newColumns, ...preserved]

        // If _id was excluded from the projection, hide it visually but keep the
        // fetched data intact so edit/delete commands can still find the document.
        if (idHidden) {
          columns = columns.map((c) => (c.field === "_id" ? { ...c, visible: false } : c))
        }

        dispatch({ type: "SET_DOCUMENTS", documents, count, totalCount })
        dispatch({ type: "SET_COLUMNS", columns })

        // When projection is active in simple mode, merge new schema into existing
        // so that excluded fields are still available for filter suggestions and
        // the pipeline JSON schema sidecar.
        if (hasSimpleProjection) {
          const merged = new Map(state.schemaMap)
          for (const [key, val] of buildSchemaMap(documents)) merged.set(key, val)
          dispatch({ type: "SET_SCHEMA", schemaMap: merged })
        } else {
          dispatch({ type: "SET_SCHEMA", schemaMap: buildSchemaMap(documents) })
        }
      })
      .catch((err: Error) => {
        if (!cancelled) dispatch({ type: "SET_ERROR", error: err.message })
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: full state read inside effect, only these trigger a reload
  }, [activeTab?.id, documentsLoading, reloadCounter])

  // Effect 2: load next page when LOAD_MORE is triggered
  useEffect(() => {
    if (!activeTab || !state.loadingMore) return

    let cancelled = false

    // Reconstruct filter/sort/projection from current state (same as Effect 1)
    let filter = {}
    let projection: Record<string, 0 | 1> | undefined
    try {
      if (queryInput.trim()) {
        if (queryMode === "bson") {
          filter = parseBsonQuery(queryInput)
        } else {
          const parsed = parseSimpleQueryFull(queryInput, state.schemaMap)
          filter = parsed.filter
          projection = parsed.projection
        }
      }
    } catch {
      /* invalid query — fetch unfiltered */
    }

    let sort: Record<string, 1 | -1> | undefined
    if (queryMode === "bson" && state.bsonSort.trim()) {
      try {
        sort = JSON.parse(state.bsonSort)
      } catch {
        /* skip */
      }
    } else if (state.sortField) {
      sort = { [state.sortField]: state.sortDirection as 1 | -1 }
    }

    if (queryMode === "bson" && state.bsonProjection.trim()) {
      try {
        projection = JSON.parse(state.bsonProjection)
      } catch {
        /* skip */
      }
    }

    // Always fetch _id so edit/delete commands work (same logic as Effect 1)
    const { projection: safeProjection } = sanitizeProjection(projection)

    fetchDocuments(activeTab.collectionName, filter, {
      sort,
      projection: safeProjection,
      skip: state.loadedCount,
      limit: pageSize,
    })
      .then(({ documents }) => {
        if (cancelled || documents.length === 0) return
        dispatch({ type: "APPEND_DOCUMENTS", documents })
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "APPEND_DOCUMENTS", documents: [] })
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only triggered by loadingMore flag
  }, [activeTab?.id, state.loadingMore])

  // Effect 3: re-run explain when documents reload and explain mode is active
  useEffect(() => {
    if (!activeTab || !documentsLoading || state.previewMode !== "explain") return

    let cancelled = false
    dispatch({ type: "SET_EXPLAIN_LOADING", loading: true })

    const query = resolveCurrentQuery(state)
    const promise =
      query.mode === "aggregate"
        ? explainAggregate(activeTab.collectionName, query.pipeline)
        : explainFind(activeTab.collectionName, query.filter, {
            sort: query.sort,
            projection: query.projection,
          })

    promise
      .then((result) => {
        if (!cancelled) dispatch({ type: "SET_EXPLAIN_RESULT", result })
      })
      .catch(() => {
        if (!cancelled) dispatch({ type: "SET_EXPLAIN_LOADING", loading: false })
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same triggers as document load
  }, [activeTab?.id, documentsLoading, reloadCounter])
}
