/**
 * Hook: Load documents when active tab changes or query is submitted.
 * Parses the query string and passes filter to fetchDocuments.
 */

import { useEffect } from "react"
import type { Dispatch } from "react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { fetchDocuments, detectColumns } from "../providers/mongodb"
import { parseSimpleQuery, parseBsonQuery } from "../query/parser"
import { buildSchemaMap } from "../query/schema"

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

    // Parse filter from query
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

    const existingColumns = state.columns

    const sort = state.sortField
      ? { [state.sortField]: state.sortDirection as 1 | -1 }
      : undefined

    fetchDocuments(activeTab.collectionName, filter, { sort })
      .then(({ documents, count, totalCount }) => {
        if (cancelled) return
        const detectedFields = detectColumns(documents)

        // Preserve display modes for existing columns, add new ones as "normal"
        const existingByField = new Map(existingColumns.map((c) => [c.field, c]))
        const columns = detectedFields.map((field) => {
          const existing = existingByField.get(field)
          return existing ?? { field, frequency: 1, visible: true, displayMode: "normal" as const }
        })

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
