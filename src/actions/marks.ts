/**
 * Document mark actions — toggle a letter mark on the selected doc(s),
 * persist to disk, and surface toast feedback.
 *
 * Disk I/O lives here (not the reducer) because the marks file is async.
 * The reducer only stores the in-memory mark list via SET_MARKS.
 */

import type { Dispatch } from "react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import {
  decodeMarkId,
  idsForLetter,
  markDocId,
  marksForScope,
  setMark,
  clearMark,
  type MarkScope,
} from "../utils/marks"
import {
  toggleMarkToken,
  removeAnyMarkToken,
  mergeMarkIntoBson,
  removeIdFromBson,
  mergeMarkIntoPipeline,
  removeIdFromPipeline,
} from "../query/markToken"

/** Resolve the active tab's mark scope. Returns null if there's no active tab. */
function activeScope(state: AppState): MarkScope | null {
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
  if (!activeTab) {
    return null
  }
  return { host: state.host, db: state.dbName, col: activeTab.collectionName }
}

/**
 * Toggle a mark letter on the currently selected document (or all rows in
 * selection mode). Writes to disk, refreshes the in-memory marks list, and
 * shows a toast describing what changed.
 */
export async function toggleMarkOnSelection(
  state: AppState,
  dispatch: Dispatch<AppAction>,
  letter: string,
): Promise<void> {
  const scope = activeScope(state)
  if (!scope) {
    return
  }
  if (state.view !== "documents") {
    return
  }

  const inSelection = state.selectionMode !== "none" && state.selectedIds.size > 0
  const targetIds = inSelection ? collectSelectedDocIds(state) : collectActiveDocId(state)

  if (targetIds.length === 0) {
    dispatch({
      type: "SHOW_MESSAGE",
      message: "Cannot mark — document has no _id",
      kind: "warning",
    })
    return
  }

  // Single-doc toggle: same letter clears, different letter replaces.
  if (!inSelection) {
    const id = targetIds[0]
    const existing = marksForScope(state.marks, scope).get(id)
    let next
    let toast: string
    if (existing === letter) {
      next = await clearMark(scope, id)
      toast = `Unmarked [${letter}]`
    } else if (existing) {
      next = await setMark(scope, id, letter)
      toast = `Replaced [${existing}] → [${letter}]`
    } else {
      next = await setMark(scope, id, letter)
      toast = `Marked [${letter}]`
    }
    dispatch({ type: "SET_MARKS", marks: next })
    dispatch({ type: "SHOW_MESSAGE", message: toast, kind: "success" })
    return
  }

  // Selection-mode toggle: if every selected row has this letter, clear all;
  // otherwise set the letter on all (replacing whatever was there).
  const scopedMarks = marksForScope(state.marks, scope)
  const allHaveLetter = targetIds.every((id) => scopedMarks.get(id) === letter)

  let next = state.marks
  if (allHaveLetter) {
    for (const id of targetIds) {
      next = await clearMark(scope, id)
    }
    dispatch({ type: "SET_MARKS", marks: next })
    dispatch({
      type: "SHOW_MESSAGE",
      message: `Unmarked [${letter}] on ${targetIds.length} doc${targetIds.length === 1 ? "" : "s"}`,
      kind: "success",
    })
  } else {
    for (const id of targetIds) {
      next = await setMark(scope, id, letter)
    }
    dispatch({ type: "SET_MARKS", marks: next })
    dispatch({
      type: "SHOW_MESSAGE",
      message: `Marked [${letter}] on ${targetIds.length} doc${targetIds.length === 1 ? "" : "s"}`,
      kind: "success",
    })
  }

  // Mirror the bulk-delete flow: drop selection mode after the op completes.
  dispatch({ type: "EXIT_SELECTION_MODE" })
}

function collectActiveDocId(state: AppState): string[] {
  const doc = state.documents[state.selectedIndex]
  if (!doc || doc._id == null) {
    return []
  }
  const id = markDocId(doc._id)
  return id ? [id] : []
}

function collectSelectedDocIds(state: AppState): string[] {
  // selectedIds is keyed via the selection reducer's idKey() (ObjectId hex, or
  // String(id) otherwise), which doesn't match markDocId() for compound ids.
  // Walk the loaded documents to bridge: match by idKey, store by markDocId.
  const ids: string[] = []
  for (const doc of state.documents) {
    if (doc._id == null) {
      continue
    }
    if (state.selectedIds.has(selectionIdKey(doc._id))) {
      const key = markDocId(doc._id)
      if (key) {
        ids.push(key)
      }
    }
  }
  return ids
}

type MaybeObjectId = { toHexString?: () => string }

/** Mirrors selection reducer's idKey — used to join selectedIds with docs. */
function selectionIdKey(id: unknown): string {
  const maybeId = id as MaybeObjectId
  return id != null && typeof maybeId.toHexString === "function"
    ? maybeId.toHexString()
    : String(id)
}

// ── Jump-to-mark (`'<letter>`) ─────────────────────────────────────────────

/**
 * Apply or toggle a mark filter for `letter`, writing into whichever query
 * mode is currently active:
 *
 *   • Simple   → toggle `@<letter>` token in queryInput, submit
 *   • BSON     → set `_id: { $in: [...] }` in queryInput (literal ObjectIds)
 *   • Pipeline → set `_id: { $in: [...] }` in the first $match stage
 *
 * Each mode produces something the user can see and edit afterwards.
 */
export function jumpToMark(state: AppState, dispatch: Dispatch<AppAction>, letter: string): void {
  const scope = activeScope(state)
  if (!scope) {
    return
  }
  if (state.view !== "documents") {
    return
  }

  // Resolve the letter's ids once. An empty register still works (the user
  // gets an `_id: { $in: [] }` filter that matches nothing — explicit feedback
  // rather than silent no-op).
  const ids = idsForLetter(state.marks, scope, letter).map(decodeMarkId)

  // ── Pipeline mode ────────────────────────────────────────────────────────
  if (state.pipelineMode) {
    const next = mergeMarkIntoPipeline(state.pipeline, ids)
    dispatch({
      type: "SET_PIPELINE",
      pipeline: next,
      source: "",
      isAggregate: false,
    })
    dispatch({
      type: "SHOW_MESSAGE",
      message: `Mark [${letter}]: ${ids.length} doc${ids.length === 1 ? "" : "s"}`,
      kind: "info",
    })
    return
  }

  // ── BSON mode ────────────────────────────────────────────────────────────
  if (state.queryMode === "bson") {
    const next = mergeMarkIntoBson(state.queryInput, ids)
    if (next === null) {
      dispatch({
        type: "SHOW_MESSAGE",
        message: "BSON filter is invalid — fix it before applying a mark",
        kind: "warning",
      })
      return
    }
    dispatch({ type: "SET_QUERY_INPUT", input: next })
    dispatch({ type: "SUBMIT_QUERY" })
    dispatch({
      type: "SHOW_MESSAGE",
      message: `Mark [${letter}]: ${ids.length} doc${ids.length === 1 ? "" : "s"}`,
      kind: "info",
    })
    return
  }

  // ── Simple mode ──────────────────────────────────────────────────────────
  // Pure textual toggle — the parser resolves `@<letter>` at query time, so
  // newly marked docs surface automatically on the next reload.
  const next = toggleMarkToken(state.queryInput, letter)
  dispatch({ type: "SET_QUERY_INPUT", input: next })
  dispatch({ type: "SUBMIT_QUERY" })
  // No toast — the visible @<letter> in the bar is the feedback.
}

/**
 * Clear any active mark filter from the current query mode (the `''` shortcut).
 *   • Simple   → strip every `@<letter>` token
 *   • BSON     → strip the `_id` key
 *   • Pipeline → strip `_id` from the first $match (and the stage if empty)
 */
export function clearMarkJump(state: AppState, dispatch: Dispatch<AppAction>): void {
  if (state.view !== "documents") {
    return
  }

  if (state.pipelineMode) {
    const next = removeIdFromPipeline(state.pipeline)
    if (next === state.pipeline) {
      return
    }
    dispatch({ type: "SET_PIPELINE", pipeline: next, source: "", isAggregate: false })
    return
  }

  if (state.queryMode === "bson") {
    const next = removeIdFromBson(state.queryInput)
    if (next === null) {
      // Broken BSON — leave it alone.
      return
    }
    if (next === state.queryInput) {
      return
    }
    dispatch({ type: "SET_QUERY_INPUT", input: next })
    dispatch({ type: "SUBMIT_QUERY" })
    return
  }

  // Simple mode
  const next = removeAnyMarkToken(state.queryInput)
  if (next === state.queryInput) {
    return
  }
  dispatch({ type: "SET_QUERY_INPUT", input: next })
  dispatch({ type: "SUBMIT_QUERY" })
}
