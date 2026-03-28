/**
 * Hook: Keyboard navigation
 * Handles global keys — quit, open palette, document navigation.
 * Does NOT handle input when command palette or query bar is open.
 */

import type { Dispatch } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { disconnect, serializeDocument } from "../providers/mongodb"
import { editDocument } from "../actions/edit"
import { formatValue } from "../utils/format"

interface UseKeyboardNavOptions {
  state: AppState
  dispatch: Dispatch<AppAction>
}

/** Get a nested value from a document */
function getNestedValue(doc: Record<string, unknown>, field: string): unknown {
  const parts = field.split(".")
  let current: unknown = doc
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function useKeyboardNav({ state, dispatch }: UseKeyboardNavOptions) {
  const renderer = useRenderer()

  useKeyboard((key) => {
    // Open command palette (always available)
    if (key.ctrl && key.name === "p") {
      dispatch({ type: "OPEN_COMMAND_PALETTE" })
      return
    }

    // Ctrl+F: open filter bar in BSON mode directly (migrates simple filter if needed)
    if (key.ctrl && key.name === "f") {
      dispatch({ type: "OPEN_QUERY_BSON" })
      return
    }

    // Filter bar key handling
    if (state.queryVisible) {
      if (key.name === "escape") {
        dispatch({ type: "CLOSE_QUERY" })
        return
      }
      // Tab always toggles mode (simple→bson or bson→simple), carrying state across
      // In BSON mode, also cycles sections on subsequent Tab presses would be confusing,
      // so Tab always toggles; sections cycle via a separate action if needed.
      if (key.name === "tab") {
        if (state.queryMode === "simple") {
          // simple → bson (migrate filter + sort)
          dispatch({ type: "TOGGLE_QUERY_MODE" })
        } else {
          // bson → simple (attempt reverse conversion)
          dispatch({ type: "TOGGLE_QUERY_MODE" })
        }
        return
      }
      // Enter submits in BSON mode (textarea keybinding fires submit() but
      // the onSubmit wiring is unreliable — handle it here directly instead)
      if ((key.name === "return" || key.name === "enter") && state.queryMode === "bson") {
        dispatch({ type: "SUBMIT_QUERY" })
        return
      }

      // BSON-mode only controls
      if (state.queryMode === "bson") {
        // Ctrl+O: toggle sort section
        if (key.ctrl && key.name === "o") {
          dispatch({ type: "TOGGLE_BSON_SORT" })
          return
        }
        // Ctrl+K: toggle projection section
        if (key.ctrl && key.name === "k") {
          dispatch({ type: "TOGGLE_BSON_PROJECTION" })
          return
        }
        // Cycle focus between sections when more than one is open
        // (Enter submits via textarea's own onSubmit, so we need a separate binding)
        if (key.ctrl && key.name === "n") {
          dispatch({ type: "CYCLE_BSON_SECTION" })
          return
        }
      }
      return
    }

    // Don't handle keys when command palette is open
    if (state.commandPaletteVisible) return

    // Quit
    if (key.name === "q") {
      disconnect().catch(() => {})
      renderer.destroy()
      process.exit(0)
    }

    // Backspace clears filter when bar is closed
    if (key.name === "backspace" && state.queryInput && state.view === "documents") {
      dispatch({ type: "CLEAR_QUERY" })
      return
    }

    // Tab management (available in document view)
    if (state.view === "documents") {
      // t: clone current tab
      if (key.name === "t") {
        dispatch({ type: "CLONE_TAB" })
        return
      }
      // d: close current tab
      if (key.name === "d" && !key.ctrl) {
        if (state.activeTabId) {
          dispatch({ type: "CLOSE_TAB", tabId: state.activeTabId })
        }
        return
      }
      // u: undo close tab (not Ctrl+U which scrolls preview)
      if (key.name === "u" && !key.ctrl) {
        dispatch({ type: "UNDO_CLOSE_TAB" })
        return
      }
      // 1-9: switch to tab by number
      if (key.sequence && /^[1-9]$/.test(key.sequence)) {
        const tabIndex = parseInt(key.sequence) - 1
        if (tabIndex < state.tabs.length) {
          dispatch({ type: "SWITCH_TAB", tabId: state.tabs[tabIndex].id })
        }
        return
      }
      // [/]: previous/next tab
      if (key.name === "[" || (key.sequence === "[")) {
        const currentIndex = state.tabs.findIndex((t) => t.id === state.activeTabId)
        if (currentIndex > 0) {
          dispatch({ type: "SWITCH_TAB", tabId: state.tabs[currentIndex - 1].id })
        }
        return
      }
      if (key.name === "]" || (key.sequence === "]")) {
        const currentIndex = state.tabs.findIndex((t) => t.id === state.activeTabId)
        if (currentIndex < state.tabs.length - 1) {
          dispatch({ type: "SWITCH_TAB", tabId: state.tabs[currentIndex + 1].id })
        }
        return
      }
    }

    // Document view
    if (state.view === "documents") {
      switch (key.name) {
        case "j":
        case "down":
          dispatch({ type: "MOVE_DOCUMENT", delta: 1 })
          break
        case "k":
        case "up":
          dispatch({ type: "MOVE_DOCUMENT", delta: -1 })
          break
        case "h":
        case "left":
          dispatch({ type: "MOVE_COLUMN", delta: -1 })
          break
        case "l":
        case "right":
          dispatch({ type: "MOVE_COLUMN", delta: 1 })
          break
        case "w":
          dispatch({ type: "CYCLE_COLUMN_MODE" })
          break
        case "s": {
          const visCols = state.columns.filter((c) => c.visible)
          const sortCol = visCols[state.selectedColumnIndex]
          if (sortCol) {
            dispatch({ type: "CYCLE_SORT", field: sortCol.field })
          }
          break
        }
        case "y": {
          const doc = state.documents[state.selectedIndex]
          if (!doc) break

          if (key.shift) {
            // Y: yank full document
            const json = serializeDocument(doc)
            const b64 = btoa(json)
            process.stdout.write(`\x1b]52;c;${b64}\x07`)
          } else {
            // y: yank current cell value
            const visCols = state.columns.filter((c) => c.visible)
            const col = visCols[state.selectedColumnIndex]
            if (!col) break
            const val = getNestedValue(doc as Record<string, unknown>, col.field)
            const text = val === undefined ? ""
              : typeof val === "object" && val !== null ? JSON.stringify(val, null, 2)
              : String(val)
            const b64 = btoa(text)
            process.stdout.write(`\x1b]52;c;${b64}\x07`)
          }
          break
        }
        case "r":
          dispatch({ type: "RELOAD_DOCUMENTS" })
          break
        case "f": {
          // Filter from current cell value
          const doc = state.documents[state.selectedIndex]
          const visibleCols = state.columns.filter((c) => c.visible)
          const col = visibleCols[state.selectedColumnIndex]
          if (!doc || !col) break

          const val = getNestedValue(doc as Record<string, unknown>, col.field)
          if (val === undefined) break

          const raw = typeof val === "string" ? val : String(val)
          // Quote values containing spaces
          const formatted = raw.includes(" ") ? `"${raw}"` : raw
          const token = `${col.field}:${formatted}`
          const newQuery = state.queryInput
            ? `${state.queryInput} ${token}`
            : token
          dispatch({ type: "SET_QUERY_INPUT", input: newQuery })
          dispatch({ type: "SUBMIT_QUERY" })
          break
        }
        case "e": {
          const doc = state.documents[state.selectedIndex]
          const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
          if (!doc || !activeTab) break

          renderer.suspend()
          editDocument(activeTab.collectionName, doc)
            .then((result) => {
              if (result.error) {
                dispatch({ type: "SHOW_MESSAGE", message: result.error })
              } else if (result.updated) {
                dispatch({ type: "SHOW_MESSAGE", message: "Document updated" })
              }
            })
            .catch((err: Error) => {
              dispatch({ type: "SHOW_MESSAGE", message: `Edit failed: ${err.message}` })
            })
            .finally(() => {
              renderer.resume()
              dispatch({ type: "RELOAD_DOCUMENTS" })
            })
          break
        }
        case "d":
          if (key.ctrl && state.previewPosition) {
            dispatch({ type: "SCROLL_PREVIEW", delta: 10 })
          }
          break
        case "u":
          if (key.ctrl && state.previewPosition) {
            dispatch({ type: "SCROLL_PREVIEW", delta: -10 })
          }
          break
        case "p":
          if (key.shift) {
            dispatch({ type: "CYCLE_PREVIEW_POSITION" })
          } else {
            dispatch({ type: "TOGGLE_PREVIEW" })
          }
          break
        case "/":
          dispatch({ type: "OPEN_QUERY" })
          break
      }
    }
  })
}
