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

interface UseKeyboardNavOptions {
  state: AppState
  dispatch: Dispatch<AppAction>
}

export function useKeyboardNav({ state, dispatch }: UseKeyboardNavOptions) {
  const renderer = useRenderer()

  useKeyboard((key) => {
    // Open command palette (always available)
    if (key.ctrl && key.name === "p") {
      dispatch({ type: "OPEN_COMMAND_PALETTE" })
      return
    }

    // Don't handle keys when overlays are open
    if (state.commandPaletteVisible || state.queryVisible) return

    // Quit
    if (key.name === "q") {
      disconnect().catch(() => {})
      renderer.destroy()
      process.exit(0)
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
        case "r":
          dispatch({ type: "RELOAD_DOCUMENTS" })
          break
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
