/**
 * Shared actions for the collection sidebar (spec 053).
 *
 * The sidebar itself is presentational; these helpers contain the small
 * amount of logic that picks the right dispatch for a given key event
 * (Enter, `d`) so the keyboard hook stays thin.
 */

import type { Dispatch } from "react"
import type { AppState } from "../types"
import type { AppAction } from "../state"

/**
 * Enter on the sidebar cursor. Three cases:
 *
 *   1. An ephemeral tab is active for the cursor's collection → promote it
 *      (spec 054). Commits the peek without rebuilding state.
 *   2. A real tab already exists for the cursor's collection → switch to it.
 *   3. No tab exists → open a fresh tab.
 *
 * In all cases focus returns to the doc list but the sidebar stays visible.
 */
export function handleSidebarEnter(state: AppState, dispatch: Dispatch<AppAction>): void {
  const col = state.collections[state.sidebarSelectedIndex]
  if (!col) {
    return
  }
  const ephemeral = state.tabs.find((t) => t.ephemeral)
  if (ephemeral && ephemeral.collectionName === col.name) {
    dispatch({ type: "PROMOTE_EPHEMERAL_TAB" })
    dispatch({ type: "BLUR_SIDEBAR" })
    return
  }
  const existingReal = state.tabs.find((t) => t.collectionName === col.name && !t.ephemeral)
  if (existingReal) {
    dispatch({ type: "SWITCH_TAB", tabId: existingReal.id })
  } else {
    dispatch({ type: "OPEN_TAB", collectionName: col.name })
  }
  dispatch({ type: "BLUR_SIDEBAR" })
}

/**
 * `d` on the sidebar cursor — close every open tab for the highlighted
 * collection. Mirrors `tab.close` semantics but sourced from the sidebar.
 * No-op if the collection has no open tab.
 *
 * If we would close the last tab, we follow the existing `tab.close`
 * convention and show a toast instead of leaving the user with zero tabs
 * and a stranded sidebar.
 */
export function closeTabsForSidebarCursor(state: AppState, dispatch: Dispatch<AppAction>): void {
  const col = state.collections[state.sidebarSelectedIndex]
  if (!col) {
    return
  }
  const targets = state.tabs.filter((t) => t.collectionName === col.name)
  if (targets.length === 0) {
    return
  }
  if (targets.length >= state.tabs.length) {
    // Would close every tab — same guardrail as the doc-view `d` binding.
    dispatch({ type: "SHOW_MESSAGE", message: "Cannot close the last tab", kind: "warning" })
    return
  }
  for (const t of targets) {
    dispatch({ type: "CLOSE_TAB", tabId: t.id })
  }
}
