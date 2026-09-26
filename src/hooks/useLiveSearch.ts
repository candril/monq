/**
 * Hook: live global search (spec 067). While the simple query bar is open,
 * a change to the search terms re-runs the query after a short pause.
 *
 * The active tab's `query` is what the current results were loaded with, so
 * comparing its terms to the input's tells whether the rows are stale. Only
 * search terms are compared — a half-typed `status:ac` would flicker the
 * list through empty results.
 */

import { useEffect } from "react"
import type { Dispatch } from "react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { searchTermsOf, termsReadyForLive } from "../query/search"

const LIVE_SEARCH_DEBOUNCE_MS = 300

export function useLiveSearch(state: AppState, dispatch: Dispatch<AppAction>): void {
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
  const live =
    state.queryVisible && state.queryMode === "simple" && !state.pipelineMode && activeTab != null

  const typedTerms = live ? searchTermsOf(state.queryInput) : []
  const appliedTerms =
    live && activeTab.queryMode === "simple" ? searchTermsOf(activeTab.query) : []
  const typedKey = typedTerms.join("\u0000")
  const stale = live && typedKey !== appliedTerms.join("\u0000") && termsReadyForLive(typedTerms)

  useEffect(() => {
    if (!stale) {
      return
    }
    const timer = setTimeout(() => dispatch({ type: "LIVE_QUERY" }), LIVE_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- typedKey restarts the debounce on every term edit
  }, [stale, typedKey, dispatch])
}
