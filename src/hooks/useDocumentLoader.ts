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
}

export function useDocumentLoader({ state, dispatch }: UseDocumentLoaderOptions) {
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
  const { documentsLoading, reloadCounter, queryInput, queryMode } = state

  useEffect(() => {
    if (!activeTab || !documentsLoading) return

    let cancelled = false
    const existingColumns = state.columns

    // Pipeline mode — aggregate or find-compatible pipeline
    if (state.pipelineMode && state.pipeline.length > 0) {
      const isAggregate = classifyPipeline(state.pipeline)

      const fetchPipeline = isAggregate
        ? fetchAggregate(activeTab.collectionName, state.pipeline)
        : (() => {
            const { filter, sort, projection } = extractFindParts(state.pipeline)
            return fetchDocuments(activeTab.collectionName, filter, { sort, projection })
          })()

      fetchPipeline
        .then(({ documents, count }) => {
          if (cancelled) return
          const detectedFields = detectColumns(documents)
          const detectedSet = new Set(detectedFields)
          const existingByField = new Map(existingColumns.map((c) => [c.field, c]))
          // New fields detected in this result page
          const newColumns = detectedFields.map((field) => {
            const existing = existingByField.get(field)
            return existing ?? { field, frequency: 1, visible: true, displayMode: "normal" as const }
          })
          // Preserve existing columns not in this result so they don't vanish after filtering
          const preserved = existingColumns.filter((c) => !detectedSet.has(c.field))
          const columns = [...newColumns, ...preserved]
          dispatch({ type: "SET_DOCUMENTS", documents, count, totalCount: count })
          dispatch({ type: "SET_COLUMNS", columns })
          dispatch({ type: "SET_SCHEMA", schemaMap: buildSchemaMap(documents) })
        })
        .catch((err: Error) => {
          if (!cancelled) dispatch({ type: "SET_ERROR", error: err.message })
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

    fetchDocuments(activeTab.collectionName, filter, { sort, projection })
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
}
