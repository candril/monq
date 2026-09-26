/**
 * Switch global search between the regex engine and the collection's text
 * index (spec 067). `$text` needs a text index, so switching to it checks
 * for one first and stays on regex without.
 */

import type { Dispatch } from "react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import type { SearchEngine } from "../query/search"
import { isTextIndex, searchTermsOf } from "../query/search"
import { listIndexes } from "../providers/mongodb"

export async function toggleSearchEngine(
  state: AppState,
  dispatch: Dispatch<AppAction>,
): Promise<void> {
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
  if (!activeTab) {
    return
  }

  if (state.searchEngine === "text") {
    apply("regex")
    return
  }

  try {
    const indexes = await listIndexes(activeTab.collectionName)
    if (!indexes.some(isTextIndex)) {
      dispatch({
        type: "SHOW_MESSAGE",
        message: `No text index on ${activeTab.collectionName} — search stays regex`,
        kind: "warning",
      })
      return
    }
  } catch (err) {
    dispatch({
      type: "SHOW_MESSAGE",
      message: `Could not list indexes: ${(err as Error).message}`,
      kind: "error",
    })
    return
  }
  apply("text")

  function apply(engine: SearchEngine) {
    dispatch({ type: "SET_SEARCH_ENGINE", engine })
    dispatch({
      type: "SHOW_MESSAGE",
      message: engine === "text" ? "Search uses the text index" : "Search uses regex",
      kind: "info",
    })
    if (searchTermsOf(state.queryInput).length > 0) {
      dispatch({ type: "LIVE_QUERY" })
    }
  }
}
