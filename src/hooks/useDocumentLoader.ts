/**
 * Hook: Load documents when active tab changes.
 */

import { useEffect } from "react"
import type { Dispatch } from "react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { fetchDocuments, detectColumns } from "../providers/mongodb"

interface UseDocumentLoaderOptions {
  state: AppState
  dispatch: Dispatch<AppAction>
}

export function useDocumentLoader({ state, dispatch }: UseDocumentLoaderOptions) {
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)

  useEffect(() => {
    if (!activeTab || !state.documentsLoading) return

    let cancelled = false

    fetchDocuments(activeTab.collectionName)
      .then(({ documents, count }) => {
        if (cancelled) return
        const columns = detectColumns(documents).map((field) => ({
          field,
          frequency: 1,
          visible: true,
          displayMode: "normal" as const,
        }))
        dispatch({ type: "SET_DOCUMENTS", documents, count })
        dispatch({ type: "SET_COLUMNS", columns })
      })
      .catch((err: Error) => {
        if (!cancelled) dispatch({ type: "SET_ERROR", error: err.message })
      })

    return () => { cancelled = true }
  }, [activeTab?.id, state.documentsLoading])
}
