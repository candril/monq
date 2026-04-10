/**
 * Hook: global keyboard navigation.
 * Thin root that delegates to focused sub-hooks by domain:
 *   - useDialogKeys     — confirmation dialogs
 *   - usePipelineKeys   — pipeline editor, Ctrl+F/E, Tab mode switch
 *   - useDocumentEditKeys — e/i/D edit, insert, delete
 * Document navigation (j/k/h/l/etc.) is handled here via a handler table.
 */

import type { Dispatch, RefObject } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import type { Keymap } from "../config/types"
import { matches } from "../utils/keymap"
import { disconnect } from "../providers/mongodb"
import { stopWatching } from "../actions/pipelineWatch"
import { switchConnection } from "../navigation"
import { switchToTab } from "../utils/tabs"
import { getExportAbort } from "../actions/palette/document"
import { filterBySelectedValue } from "../actions/filterValue"
import { yankDocument, yankCell } from "../actions/yank"
import { hideColumn } from "../actions/hideColumn"
import { toggleMarkOnSelection, jumpToMark, clearMarkJump } from "../actions/marks"
import { handleSidebarEnter, closeTabsForSidebarCursor } from "../actions/sidebar"
import { useDialogKeys } from "./useDialogKeys"
import { usePipelineKeys } from "./usePipelineKeys"
import { useDocumentEditKeys } from "./useDocumentEditKeys"

interface UseKeyboardNavOptions {
  state: AppState
  dispatch: Dispatch<AppAction>
  docListScrollRef: RefObject<ScrollBoxRenderable>
  keymap: Keymap
}

export function useKeyboardNav({
  state,
  dispatch,
  docListScrollRef,
  keymap,
}: UseKeyboardNavOptions) {
  const renderer = useRenderer()
  const {
    handleKey: handleDialogKey,
    pipelineFocusedIndex,
    bulkEditFocusedIndex,
    deleteFocusedIndex,
    bulkQueryUpdateFocusedIndex,
    bulkQueryUpdateAwaitingFinal,
    bulkQueryDeleteFocusedIndex,
    bulkQueryDeleteAwaitingFinal,
    indexCreateFocusedIndex,
    exportCancelFocusedIndex,
  } = useDialogKeys({ state, dispatch })
  const { handleKey: handlePipelineKey } = usePipelineKeys({ state, dispatch, renderer, keymap })
  const { handleKey: handleEditKey } = useDocumentEditKeys({ state, dispatch, renderer, keymap })

  // ── Document-view handler table ────────────────────────────────────
  // Each entry maps a keymap action to a handler.  Handlers return void;
  // the table is iterated in order and short-circuits on the first match.
  type Handler = () => void
  const docHandlers: Array<[action: keyof Keymap, handler: Handler]> = [
    // Tab management
    ["tab.clone", () => dispatch({ type: "CLONE_TAB" })],
    [
      "tab.close",
      () => {
        if (state.tabs.length <= 1) {
          dispatch({ type: "SHOW_MESSAGE", message: "Cannot close the last tab", kind: "warning" })
        } else if (state.activeTabId) {
          dispatch({ type: "CLOSE_TAB", tabId: state.activeTabId })
        }
      },
    ],
    ["tab.undo_close", () => dispatch({ type: "UNDO_CLOSE_TAB" })],
    [
      "tab.prev",
      () => {
        const idx = state.tabs.findIndex((t) => t.id === state.activeTabId)
        if (idx > 0) {
          switchToTab(state.tabs[idx - 1].id, dispatch)
        }
      },
    ],
    [
      "tab.next",
      () => {
        const idx = state.tabs.findIndex((t) => t.id === state.activeTabId)
        if (idx < state.tabs.length - 1) {
          switchToTab(state.tabs[idx + 1].id, dispatch)
        }
      },
    ],

    // Filter bar
    ["filter_bar.toggle", () => dispatch({ type: "TOGGLE_FILTER_BAR" })],

    // Navigation
    [
      "nav.down",
      () => {
        if (state.selectionMode === "selecting") {
          dispatch({ type: "MOVE_SELECTION", delta: 1 })
        } else {
          dispatch({ type: "MOVE_DOCUMENT", delta: 1 })
        }
        if (
          !state.loadingMore &&
          state.loadedCount < state.documentCount &&
          state.selectedIndex >= state.documents.length - 10
        ) {
          dispatch({ type: "LOAD_MORE" })
        }
      },
    ],
    [
      "nav.up",
      () => {
        if (state.selectionMode === "selecting") {
          dispatch({ type: "MOVE_SELECTION", delta: -1 })
        } else {
          dispatch({ type: "MOVE_DOCUMENT", delta: -1 })
        }
      },
    ],
    ["nav.left", () => dispatch({ type: "MOVE_COLUMN", delta: -1 })],
    ["nav.right", () => dispatch({ type: "MOVE_COLUMN", delta: 1 })],
    ["nav.column_mode", () => dispatch({ type: "CYCLE_COLUMN_MODE" })],

    // Selection
    [
      "selection.toggle",
      () => {
        if (state.selectionMode === "none" || state.selectionMode === "selected") {
          dispatch({ type: "ENTER_SELECTION_MODE" })
        } else {
          dispatch({ type: "FREEZE_SELECTION" })
        }
      },
    ],
    ["selection.toggle_row", () => dispatch({ type: "TOGGLE_CURRENT_ROW" })],
    ["selection.jump_end", () => dispatch({ type: "JUMP_SELECTION_END" })],

    // Document actions
    ["doc.reload", () => dispatch({ type: "RELOAD_DOCUMENTS" })],
    ["preview.cycle_position", () => dispatch({ type: "CYCLE_PREVIEW_POSITION" })],
    ["preview.toggle", () => dispatch({ type: "TOGGLE_PREVIEW" })],
    [
      "doc.sort",
      () => {
        const visCols = state.columns.filter((c) => c.visible)
        const sortCol = visCols[state.selectedColumnIndex]
        if (sortCol) {
          dispatch({ type: "CYCLE_SORT", field: sortCol.field })
        }
      },
    ],
    ["doc.yank_document", () => yankDocument(state, dispatch)],
    ["doc.yank_cell", () => yankCell(state, dispatch)],
    ["doc.filter_value", () => filterBySelectedValue(state, dispatch)],
    ["doc.hide_column", () => hideColumn(state, dispatch)],

    // Ephemeral peek (spec 054) — `}` / `{` browse collections in place
    ["collection.peek_next", () => dispatch({ type: "PEEK_COLLECTION", delta: 1 })],
    ["collection.peek_prev", () => dispatch({ type: "PEEK_COLLECTION", delta: -1 })],
  ]

  /** Scroll half a page up or down, or scroll preview when preview is focused. */
  function halfPageScroll(dir: 1 | -1): void {
    if (state.view !== "documents") {
      return
    }
    if (state.previewPosition) {
      dispatch({ type: "SCROLL_PREVIEW", delta: dir * 10 })
      return
    }
    const scrollbox = docListScrollRef.current
    if (!scrollbox) {
      return
    }
    const viewportHeight = scrollbox.viewport?.height ?? 20
    const half = Math.floor(viewportHeight / 2)
    const newIndex = Math.max(
      0,
      Math.min(state.documents.length - 1, state.selectedIndex + dir * half),
    )
    dispatch({ type: "SELECT_DOCUMENT", index: newIndex })
    scrollbox.scrollTo(Math.max(0, scrollbox.scrollTop + dir * half))
    if (
      dir === 1 &&
      !state.loadingMore &&
      state.loadedCount < state.documentCount &&
      newIndex >= state.documents.length - 10
    ) {
      dispatch({ type: "LOAD_MORE" })
    }
  }

  /** Quit the app: stop watching, disconnect, tear down renderer. */
  function quitApp(): void {
    stopWatching()
    disconnect().catch(() => {})
    renderer.destroy()
    process.exit(0)
  }

  /** Clear the active filter or pipeline. Returns true if something was cleared. */
  function clearQuery(): boolean {
    if (state.pipelineMode) {
      stopWatching()
      dispatch({ type: "STOP_PIPELINE_WATCH" })
      dispatch({ type: "CLEAR_PIPELINE" })
      return true
    }
    if (state.queryInput) {
      dispatch({ type: "CLEAR_QUERY" })
      return true
    }
    return false
  }

  useKeyboard((key) => {
    // ── Error screen ───────────────────────────────────────────────────
    // When stuck on the error view, only quit and back-to-connection work.
    if (state.error) {
      if (matches(key, keymap["app.quit"])) {
        quitApp()
        return
      }
      if (key.name === "escape") {
        switchConnection()
        return
      }
      return
    }

    // ── Global intercepts (order-dependent) ────────────────────────────

    // Mark/jump pending modes — must run before ANY handler that could
    // claim a single letter (edit keys consume `e`/`i`/`D`, the doc handler
    // table consumes `q`/`o`/etc., palette consumes Ctrl+P, …).
    //
    // Pending mode is modal: any non-letter key cancels silently. The user
    // who pressed `m` and then `q` gets pending cancelled and has to press
    // `q` again to quit. That's the same model vim uses for `m` + Esc.
    if (state.markPending) {
      if (key.name && /^[a-z]$/.test(key.name)) {
        const letter = key.name
        dispatch({ type: "EXIT_MARK_PENDING" })
        // Fire-and-forget: the action handles disk I/O + dispatches SET_MARKS.
        void toggleMarkOnSelection(state, dispatch, letter)
      } else {
        dispatch({ type: "EXIT_MARK_PENDING" })
      }
      return
    }

    if (state.jumpPending) {
      // `''` (a second `'` while pending) clears any active mark filter from
      // the current query mode.
      if (matches(key, keymap["mark.jump"])) {
        dispatch({ type: "EXIT_JUMP_PENDING" })
        clearMarkJump(state, dispatch)
        return
      }
      if (key.name && /^[a-z]$/.test(key.name)) {
        const letter = key.name
        dispatch({ type: "EXIT_JUMP_PENDING" })
        jumpToMark(state, dispatch, letter)
      } else {
        dispatch({ type: "EXIT_JUMP_PENDING" })
      }
      return
    }

    // palette.open: only when a collection is open and query bar is closed
    if (
      matches(key, keymap["palette.open"]) &&
      state.activeTabId &&
      !state.queryVisible &&
      !state.historyPickerOpen
    ) {
      dispatch({ type: "OPEN_COMMAND_PALETTE" })
      return
    }

    // Edit keys (e/i/D/Ctrl+U) — before nav so Ctrl+U can override nav.half_page_up
    if (handleEditKey(key)) {
      return
    }

    // Half-page scroll
    if (matches(key, keymap["nav.half_page_down"]) || matches(key, keymap["nav.half_page_up"])) {
      halfPageScroll(matches(key, keymap["nav.half_page_down"]) ? 1 : -1)
      return
    }

    // Pipeline keys (pipeline.open, pipeline.open_full, query.toggle_mode, query.open)
    if (handlePipelineKey(key)) {
      return
    }

    // Filter bar intercept
    if (state.queryVisible) {
      if (key.name === "escape") {
        dispatch({ type: "CLOSE_QUERY" })
        return
      }
      if (matches(key, keymap["query.toggle_mode"])) {
        dispatch({ type: "CLOSE_QUERY" })
        dispatch({ type: "ENTER_PIPELINE_MODE" })
        return
      }
      return
    }

    // Don't handle keys when command palette is open
    if (state.commandPaletteVisible) {
      return
    }

    // Dialog keys (pipeline confirm, bulk edit confirm, delete confirm)
    if (handleDialogKey(key)) {
      return
    }

    // ── Collection sidebar (spec 053 + 054) ────────────────────────────
    // When the sidebar has keyboard focus it acts as a modal list. Nav keys
    // dispatch PEEK_COLLECTION with anchor="cursor" so the walk follows the
    // sidebar cursor (not the active tab) and clamps at the ends like a
    // normal list. Enter promotes or switches; Esc discards any peek and
    // blurs; q quits.
    //
    // Gated on `state.dbName` (not `state.activeTabId`) so the sidebar
    // still works in the empty post-discard state from spec 055 — DB picked
    // but no tab open — where the sidebar is the only navigation surface.
    if (state.sidebarFocused && state.dbName) {
      if (matches(key, keymap["sidebar.toggle"])) {
        dispatch({ type: "TOGGLE_SIDEBAR" })
        return
      }
      if (matches(key, keymap["app.quit"])) {
        quitApp()
        return
      }
      if (matches(key, keymap["nav.down"])) {
        dispatch({ type: "PEEK_COLLECTION", delta: 1, anchor: "cursor" })
        return
      }
      if (matches(key, keymap["nav.up"])) {
        dispatch({ type: "PEEK_COLLECTION", delta: -1, anchor: "cursor" })
        return
      }
      if (matches(key, keymap["nav.right"])) {
        // `l` exits the sidebar back into the doc list, committing whatever
        // collection is currently peeked. Symmetric with `h` on the leftmost
        // cell (which focuses the sidebar). Promotes any ephemeral, opens a
        // new tab if there's no active tab at all (empty post-discard
        // state), then blurs the sidebar so the doc list takes over input.
        //
        // Different from Enter only in intent: Enter commits the cursor's
        // collection (which can be a different one than the active tab if
        // the user navigated without auto-peek); `l` is "I'm done browsing,
        // get me out". In practice they overlap because sidebar j/k always
        // auto-peeks, so cursor and ephemeral track each other.
        handleSidebarEnter(state, dispatch)
        return
      }
      if (key.name === "return") {
        handleSidebarEnter(state, dispatch)
        return
      }
      if (key.name === "escape") {
        // Discard any in-flight peek before releasing focus. Safe no-op
        // when there's no ephemeral tab.
        dispatch({ type: "DISCARD_EPHEMERAL_TAB" })
        dispatch({ type: "BLUR_SIDEBAR" })
        return
      }
      if (matches(key, keymap["tab.close"])) {
        closeTabsForSidebarCursor(state, dispatch)
        return
      }
      // Swallow everything else so it doesn't fall through to the doc list.
      return
    }

    // sidebar.toggle when not focused — opens (and focuses) the sidebar,
    // or refocuses it if it's already open. Gated on `state.dbName` so it
    // works in the empty post-discard state too (where the user has no
    // active tab but is past the welcome screen).
    if (matches(key, keymap["sidebar.toggle"]) && state.dbName) {
      dispatch({ type: "TOGGLE_SIDEBAR" })
      return
    }

    // Escape exits selection mode
    if (key.name === "escape" && state.selectionMode !== "none") {
      dispatch({ type: "EXIT_SELECTION_MODE" })
      return
    }

    // Escape discards an in-flight peek (spec 054). Runs AFTER selection
    // exit so `v` + Esc still cancels selection rather than the peek.
    if (key.name === "escape" && state.tabs.some((t) => t.ephemeral)) {
      dispatch({ type: "DISCARD_EPHEMERAL_TAB" })
      return
    }

    // selection.select_all
    if (matches(key, keymap["selection.select_all"]) && state.view === "documents") {
      dispatch({ type: "SELECT_ALL" })
      return
    }

    // Escape during export → show cancel confirmation (low priority — after
    // dialog keys, selection mode exit, and query close have all been checked)
    if (key.name === "escape" && state.exporting) {
      const abort = getExportAbort()
      if (abort) {
        dispatch({
          type: "SHOW_EXPORT_CANCEL_CONFIRM",
          confirmation: {
            format: "json",
            resolve: (confirmed) => {
              if (confirmed) {
                abort.abort()
              }
            },
          },
        })
        return
      }
    }

    // app.quit — skip when welcome screen is active (user may be typing in
    // its search input). Gated on `state.dbName` post spec 055: once a DB
    // is picked we're past the welcome screen and `q` is safe to handle,
    // even if no tab is currently open (e.g. after discarding the
    // auto-peek with Esc).
    if (matches(key, keymap["app.quit"]) && state.dbName) {
      quitApp()
      return
    }

    // query.clear: clear filter or pipeline
    if (matches(key, keymap["query.clear"]) && state.view === "documents") {
      if (clearQuery()) {
        return
      }
    }

    // ── Document view only ─────────────────────────────────────────────

    if (state.view !== "documents") {
      return
    }

    // Enter mark pending mode on `m`. The pending handler at the top of this
    // useKeyboard callback consumes the next letter, so `m` doesn't fall
    // through to the regular doc handler table.
    if (matches(key, keymap["mark.set"]) && state.activeTabId) {
      dispatch({ type: "ENTER_MARK_PENDING" })
      return
    }

    // Enter jump pending mode on `'`. The pending handler turns a second
    // `'` into a clear (`''`), so a lone `'` always waits for a letter.
    if (matches(key, keymap["mark.jump"]) && state.activeTabId) {
      dispatch({ type: "ENTER_JUMP_PENDING" })
      return
    }

    // Tab switch by number (tab.switch_1 … tab.switch_9)
    for (let n = 1; n <= 9; n++) {
      const action = `tab.switch_${n}` as keyof Keymap
      if (matches(key, keymap[action])) {
        const tabIndex = n - 1
        if (tabIndex < state.tabs.length) {
          switchToTab(state.tabs[tabIndex].id, dispatch)
        }
        return
      }
    }

    // `h` (nav.left) on the leftmost column focuses the sidebar — single
    // keystroke shortcut from the doc list into the sidebar instead of
    // Ctrl+B. Only when the cursor is already at column 0; otherwise nav.left
    // does its normal thing via the handler table below. Sidebar must be
    // open; we don't auto-open it on h.
    if (
      matches(key, keymap["nav.left"]) &&
      state.selectedColumnIndex === 0 &&
      state.sidebarOpen &&
      state.dbName
    ) {
      dispatch({ type: "FOCUS_SIDEBAR" })
      return
    }

    // Handler table: match keymap action → run handler
    for (const [action, handler] of docHandlers) {
      if (matches(key, keymap[action])) {
        handler()
        return
      }
    }
  })

  return {
    pipelineFocusedIndex,
    bulkEditFocusedIndex,
    deleteFocusedIndex,
    bulkQueryUpdateFocusedIndex,
    bulkQueryUpdateAwaitingFinal,
    bulkQueryDeleteFocusedIndex,
    bulkQueryDeleteAwaitingFinal,
    indexCreateFocusedIndex,
    exportCancelFocusedIndex,
  }
}
