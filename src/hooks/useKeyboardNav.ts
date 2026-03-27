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
