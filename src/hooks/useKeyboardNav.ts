/**
 * Hook: Keyboard navigation
 * Handles global keys — quit, open palette, document navigation.
 * Does NOT handle input when command palette or query bar is open.
 */

import type { Dispatch } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { disconnect } from "../providers/mongodb"
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

    // Filter bar: only handle Escape to close
    if (state.queryVisible) {
      if (key.name === "escape") {
        dispatch({ type: "CLOSE_QUERY" })
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
