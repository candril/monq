/**
 * Hook: Load documents when active tab changes or query is submitted.
 * Parses the query string and passes filter to fetchDocuments.
 */

import { useEffect } from "react"
import type { Dispatch } from "react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { fetchDocuments, fetchAggregate, detectColumns } from "../providers/mongodb"
import { parseSimpleQuery, parseBsonQuery } from "../query/parser"
import { buildSchemaMap } from "../query/schema"
import { classifyPipeline, extractFindParts } from "../actions/pipeline"

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
      const pipelinePreservesShape = state.pipeline.every(
        (stage) => SHAPE_PRESERVING.has(Object.keys(stage)[0])
      )

      const fetchPipeline = isAggregate
        ? fetchAggregate(activeTab.collectionName, state.pipeline, { limit: pageSize })
        : (() => {
            const { filter, sort, projection } = extractFindParts(state.pipeline)
            return fetchDocuments(activeTab.collectionName, filter, { sort, projection, limit: pageSize })
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
              return existing ?? { field, frequency: 1, visible: true, displayMode: "normal" as const }
            })
            const preserved = existingColumns.filter((c) => !detectedSet.has(c.field))
            columns = [...newColumns, ...preserved]
          } else {
            // Pipeline reshapes documents — detect fresh from results only
            columns = detectedFields.map((field) => ({
              field, frequency: 1, visible: true, displayMode: "normal" as const,
            }))
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
            dispatch({ type: "SHOW_MESSAGE", message: `Pipeline error: ${err.message}`, kind: "error" })
          } else {
            dispatch({ type: "SET_ERROR", error: err.message })
          }
        })

      return () => { cancelled = true }
    }

    // Simple / BSON filter mode
    let filter = {}
    try {
      if (queryInput.trim()) {
        filter = queryMode === "bson"
          ? parseBsonQuery(queryInput)
          : parseSimpleQuery(queryInput, state.schemaMap)
      }
    } catch {
      // Invalid query — fetch unfiltered
    }

    // Sort: bson mode uses bsonSort textarea, simple mode uses sortField
    let sort: Record<string, 1 | -1> | undefined
    if (queryMode === "bson" && state.bsonSort.trim()) {
      try { sort = JSON.parse(state.bsonSort) } catch { /* skip */ }
    } else if (state.sortField) {
      sort = { [state.sortField]: state.sortDirection as 1 | -1 }
    }

    // Projection: bson mode only
    let projection: Record<string, 0 | 1> | undefined
    if (queryMode === "bson" && state.bsonProjection.trim()) {
      try { projection = JSON.parse(state.bsonProjection) } catch { /* skip */ }
    }

    fetchDocuments(activeTab.collectionName, filter, { sort, projection, limit: pageSize })
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
        // Preserve existing columns not in this result so they don't vanish after filtering
        const preserved = existingColumns.filter((c) => !detectedSet.has(c.field))
        const columns = [...newColumns, ...preserved]

        dispatch({ type: "SET_DOCUMENTS", documents, count, totalCount })
        dispatch({ type: "SET_COLUMNS", columns })
        dispatch({ type: "SET_SCHEMA", schemaMap: buildSchemaMap(documents) })
      })
      .catch((err: Error) => {
        if (!cancelled) dispatch({ type: "SET_ERROR", error: err.message })
      })

    return () => { cancelled = true }
  }, [activeTab?.id, documentsLoading, reloadCounter])

  // Effect 2: load next page when LOAD_MORE is triggered
  useEffect(() => {
    if (!activeTab || !state.loadingMore) return

    let cancelled = false

    // Reconstruct filter/sort from current state (same as Effect 1)
    let filter = {}
    try {
      if (queryInput.trim()) {
        filter = queryMode === "bson"
          ? parseBsonQuery(queryInput)
          : parseSimpleQuery(queryInput, state.schemaMap)
      }
    } catch { /* invalid query — fetch unfiltered */ }

    let sort: Record<string, 1 | -1> | undefined
    if (queryMode === "bson" && state.bsonSort.trim()) {
      try { sort = JSON.parse(state.bsonSort) } catch { /* skip */ }
    } else if (state.sortField) {
      sort = { [state.sortField]: state.sortDirection as 1 | -1 }
    }

    let projection: Record<string, 0 | 1> | undefined
    if (queryMode === "bson" && state.bsonProjection.trim()) {
      try { projection = JSON.parse(state.bsonProjection) } catch { /* skip */ }
    }

    fetchDocuments(activeTab.collectionName, filter, {
      sort,
      projection,
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

    return () => { cancelled = true }
  }, [activeTab?.id, state.loadingMore])
}
