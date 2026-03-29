/**
 * Hook: keyboard handling for modal confirmation dialogs.
 * Covers pipeline-confirm, bulk-edit-confirm, and delete-confirm.
 * Returns true if a dialog consumed the key (caller should return early).
 */

import type { Dispatch } from "react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { stopWatching } from "../actions/pipelineWatch"

interface UseDialogKeysOptions {
  state: AppState
  dispatch: Dispatch<AppAction>
}

export function useDialogKeys({ state, dispatch }: UseDialogKeysOptions) {
  function handleKey(key: { name: string; ctrl?: boolean; shift?: boolean }): boolean {
    // Pipeline→simple confirmation dialog
    if (state.pipelineConfirm) {
      const confirm = state.pipelineConfirm
      const opts = [
        {
          key: "n",
          exec: () => {
            stopWatching()
            dispatch({ type: "STOP_PIPELINE_WATCH" })
            dispatch({ type: "CONFIRM_NEW_TAB_SIMPLE", query: confirm.simpleQuery })
            dispatch({ type: "CLONE_TAB" })
            dispatch({ type: "CLEAR_PIPELINE" })
            dispatch({ type: "OPEN_QUERY" })
          },
        },
        {
          key: "o",
          exec: () => {
            stopWatching()
            dispatch({ type: "STOP_PIPELINE_WATCH" })
            dispatch({ type: "CONFIRM_OVERWRITE_SIMPLE", query: confirm.simpleQuery })
          },
        },
        { key: "escape", exec: () => dispatch({ type: "DISMISS_PIPELINE_CONFIRM" }) },
      ]
      if (key.name === "escape") {
        dispatch({ type: "DISMISS_PIPELINE_CONFIRM" })
      } else if (key.name === "h" || key.name === "left") {
        dispatch({ type: "MOVE_PIPELINE_CONFIRM_FOCUS", delta: -1 })
      } else if (key.name === "l" || key.name === "right") {
        dispatch({ type: "MOVE_PIPELINE_CONFIRM_FOCUS", delta: 1 })
      } else if (key.name === "return") {
        if (confirm.focusedIndex >= 0) opts[confirm.focusedIndex]?.exec()
      } else {
        const match = opts.findIndex((o) => o.key === key.name)
        if (match !== -1)
          dispatch({ type: "MOVE_PIPELINE_CONFIRM_FOCUS", delta: match - confirm.focusedIndex })
      }
      return true
    }

    // Bulk edit confirmation dialog
    if (state.bulkEditConfirmation) {
      const { resolve, goBack, missing, added, focusedIndex } = state.bulkEditConfirmation
      const opts: Array<{ key: string; exec: () => void }> = [
        {
          key: "b",
          exec: () => {
            dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" })
            goBack()
          },
        },
        {
          key: "i",
          exec: () => {
            dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" })
            resolve("ignore", "ignore")
          },
        },
      ]
      if (missing.length > 0)
        opts.push({
          key: "d",
          exec: () => {
            dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" })
            resolve("delete", "ignore")
          },
        })
      if (added.length > 0)
        opts.push({
          key: "a",
          exec: () => {
            dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" })
            resolve("ignore", "insert")
          },
        })
      if (missing.length > 0 && added.length > 0)
        opts.push({
          key: "x",
          exec: () => {
            dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" })
            resolve("delete", "insert")
          },
        })
      opts.push({
        key: "c",
        exec: () => dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" }),
      })

      if (key.name === "return") {
        if (focusedIndex >= 0) opts[focusedIndex]?.exec()
      } else if (key.name === "h" || key.name === "left") {
        dispatch({ type: "MOVE_BULK_EDIT_FOCUS", delta: -1 })
      } else if (key.name === "l" || key.name === "right") {
        dispatch({ type: "MOVE_BULK_EDIT_FOCUS", delta: 1 })
      } else {
        const match = opts.findIndex((o) => o.key === key.name)
        if (match !== -1) dispatch({ type: "SET_BULK_EDIT_FOCUS", index: match })
      }
      return true
    }

    // Delete confirmation dialog
    if (state.deleteConfirmation) {
      const { resolve, focusedIndex } = state.deleteConfirmation
      const opts = [
        {
          key: "c",
          exec: () => {
            dispatch({ type: "CLEAR_DELETE_CONFIRM" })
            resolve(false)
          },
        },
        {
          key: "d",
          exec: () => {
            dispatch({ type: "CLEAR_DELETE_CONFIRM" })
            resolve(true)
          },
        },
      ]
      if (key.name === "return") {
        if (focusedIndex >= 0) opts[focusedIndex]?.exec()
      } else if (key.name === "escape") {
        dispatch({ type: "CLEAR_DELETE_CONFIRM" })
        resolve(false)
      } else if (key.name === "h" || key.name === "left") {
        dispatch({ type: "MOVE_DELETE_FOCUS", delta: -1 })
      } else if (key.name === "l" || key.name === "right") {
        dispatch({ type: "MOVE_DELETE_FOCUS", delta: 1 })
      } else {
        const match = opts.findIndex((o) => o.key === key.name)
        if (match !== -1) dispatch({ type: "SET_DELETE_FOCUS", index: match })
      }
      return true
    }

    return false
  }

  return { handleKey }
}
