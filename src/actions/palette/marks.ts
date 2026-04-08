/** Palette handlers: document mark operations (clear-all, clear-letter) */

import type { PaletteContext } from "./types"
import { clearAllMarks, clearMark, idsForLetter, lettersInScope } from "../../utils/marks"

/**
 * Handle a `marks:*` command id. Returns true if handled (caller can stop
 * routing); false if the id isn't a marks command.
 */
export function handleMarksCommand(cmdId: string, ctx: PaletteContext): boolean {
  if (!cmdId.startsWith("marks:")) {
    return false
  }
  const { state, dispatch } = ctx
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
  if (!activeTab) {
    dispatch({ type: "CLOSE_COMMAND_PALETTE" })
    return true
  }
  const scope = {
    host: state.host,
    db: state.dbName,
    col: activeTab.collectionName,
  }

  // marks:clear-all — drop every mark in the current (host, db, col) scope
  if (cmdId === "marks:clear-all") {
    dispatch({ type: "CLOSE_COMMAND_PALETTE" })
    const before = lettersInScope(state.marks, scope)
    let total = 0
    for (const n of before.values()) {
      total += n
    }
    if (total === 0) {
      dispatch({
        type: "SHOW_MESSAGE",
        message: "No marks to clear in this collection",
        kind: "info",
      })
      return true
    }
    void clearAllMarks(scope).then((next) => {
      dispatch({ type: "SET_MARKS", marks: next })
      dispatch({
        type: "SHOW_MESSAGE",
        message: `Cleared ${total} mark${total === 1 ? "" : "s"}`,
        kind: "success",
      })
    })
    return true
  }

  // marks:clear-letter:<a-z> — drop every doc tagged with that letter
  const clearLetter = cmdId.match(/^marks:clear-letter:([a-z])$/)
  if (clearLetter) {
    dispatch({ type: "CLOSE_COMMAND_PALETTE" })
    const letter = clearLetter[1]
    const ids = idsForLetter(state.marks, scope, letter)
    if (ids.length === 0) {
      dispatch({
        type: "SHOW_MESSAGE",
        message: `No docs marked [${letter}]`,
        kind: "info",
      })
      return true
    }
    void (async () => {
      let next = state.marks
      for (const id of ids) {
        next = await clearMark(scope, id)
      }
      dispatch({ type: "SET_MARKS", marks: next })
      dispatch({
        type: "SHOW_MESSAGE",
        message: `Cleared mark [${letter}] from ${ids.length} doc${ids.length === 1 ? "" : "s"}`,
        kind: "success",
      })
    })()
    return true
  }

  return false
}
