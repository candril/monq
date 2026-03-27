/**
 * Hook: Keyboard navigation
 * Handles all keyboard input — collection browsing, document nav, quit.
 */

import type { Dispatch } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { disconnect } from "../providers/mongodb"

interface UseKeyboardNavOptions {
  state: AppState
  dispatch: Dispatch<AppAction>
}

export function useKeyboardNav({ state, dispatch }: UseKeyboardNavOptions) {
  const renderer = useRenderer()

  useKeyboard((key) => {
    // Command palette (always available)
    if (key.ctrl && key.name === "p") {
      dispatch({ type: "OPEN_COMMAND_PALETTE" })
      return
    }

    // Don't handle keys when overlays are open
    if (state.queryVisible || state.commandPaletteVisible) return

    // Quit
    if (key.name === "q") {
      disconnect().finally(() => renderer.destroy())
      return
    }

    // Collection browser
    if (state.view === "collections") {
      switch (key.name) {
        case "j":
        case "down":
          dispatch({ type: "MOVE_COLLECTION", delta: 1 })
          break
        case "k":
        case "up":
          dispatch({ type: "MOVE_COLLECTION", delta: -1 })
          break
        case "return": {
          const col = state.collections[state.collectionSelectedIndex]
          if (col) {
            dispatch({ type: "OPEN_TAB", collectionName: col.name })
          }
          break
        }
      }
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
        case "escape":
          dispatch({ type: "SET_VIEW", view: "collections" })
          break
      }
      return
    }
  })
}
