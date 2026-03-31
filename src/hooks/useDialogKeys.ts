/**
 * Hook: keyboard handling for modal confirmation dialogs.
 * Covers pipeline-confirm, bulk-edit-confirm, and delete-confirm.
 * Returns true if a dialog consumed the key (caller should return early).
 */

import { useState } from "react"
import type { Dispatch } from "react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { stopWatching } from "../actions/pipelineWatch"

interface UseDialogKeysOptions {
  state: AppState
  dispatch: Dispatch<AppAction>
}

export function useDialogKeys({ state, dispatch }: UseDialogKeysOptions) {
  const [pipelineFocusedIndex, setPipelineFocusedIndex] = useState(-1)
  const [bulkEditFocusedIndex, setBulkEditFocusedIndex] = useState(-1)
  const [deleteFocusedIndex, setDeleteFocusedIndex] = useState(-1)
  const [bulkQueryUpdateFocusedIndex, setBulkQueryUpdateFocusedIndex] = useState(-1)
  const [bulkQueryUpdateAwaitingFinal, setBulkQueryUpdateAwaitingFinal] = useState(false)
  const [bulkQueryDeleteFocusedIndex, setBulkQueryDeleteFocusedIndex] = useState(-1)
  const [bulkQueryDeleteAwaitingFinal, setBulkQueryDeleteAwaitingFinal] = useState(false)

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
            setPipelineFocusedIndex(-1)
          },
        },
        {
          key: "o",
          exec: () => {
            stopWatching()
            dispatch({ type: "STOP_PIPELINE_WATCH" })
            dispatch({ type: "CONFIRM_OVERWRITE_SIMPLE", query: confirm.simpleQuery })
            setPipelineFocusedIndex(-1)
          },
        },
        {
          key: "escape",
          exec: () => {
            dispatch({ type: "DISMISS_PIPELINE_CONFIRM" })
            setPipelineFocusedIndex(-1)
          },
        },
      ]
      if (key.name === "escape") {
        dispatch({ type: "DISMISS_PIPELINE_CONFIRM" })
        setPipelineFocusedIndex(-1)
      } else if (key.name === "h" || key.name === "left") {
        setPipelineFocusedIndex((i) => Math.max(-1, i - 1))
      } else if (key.name === "l" || key.name === "right") {
        setPipelineFocusedIndex((i) => Math.min(opts.length - 1, i + 1))
      } else if (key.name === "return") {
        if (pipelineFocusedIndex >= 0) opts[pipelineFocusedIndex]?.exec()
      } else {
        const match = opts.findIndex((o) => o.key === key.name)
        if (match !== -1) setPipelineFocusedIndex(match)
      }
      return true
    }

    // Bulk edit confirmation dialog
    if (state.bulkEditConfirmation) {
      const { resolve, goBack, missing, added } = state.bulkEditConfirmation
      const opts: Array<{ key: string; exec: () => void }> = [
        {
          key: "b",
          exec: () => {
            dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" })
            setBulkEditFocusedIndex(-1)
            goBack()
          },
        },
        {
          key: "i",
          exec: () => {
            dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" })
            setBulkEditFocusedIndex(-1)
            resolve("ignore", "ignore")
          },
        },
      ]
      if (missing.length > 0)
        opts.push({
          key: "d",
          exec: () => {
            dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" })
            setBulkEditFocusedIndex(-1)
            resolve("delete", "ignore")
          },
        })
      if (added.length > 0)
        opts.push({
          key: "a",
          exec: () => {
            dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" })
            setBulkEditFocusedIndex(-1)
            resolve("ignore", "insert")
          },
        })
      if (missing.length > 0 && added.length > 0)
        opts.push({
          key: "x",
          exec: () => {
            dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" })
            setBulkEditFocusedIndex(-1)
            resolve("delete", "insert")
          },
        })
      opts.push({
        key: "c",
        exec: () => {
          dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" })
          setBulkEditFocusedIndex(-1)
        },
      })

      if (key.name === "return") {
        if (bulkEditFocusedIndex >= 0) opts[bulkEditFocusedIndex]?.exec()
      } else if (key.name === "h" || key.name === "left") {
        setBulkEditFocusedIndex((i) => Math.max(-1, i - 1))
      } else if (key.name === "l" || key.name === "right") {
        setBulkEditFocusedIndex((i) => Math.min(opts.length - 1, i + 1))
      } else {
        const match = opts.findIndex((o) => o.key === key.name)
        if (match !== -1) setBulkEditFocusedIndex(match)
      }
      return true
    }

    // Delete confirmation dialog
    if (state.deleteConfirmation) {
      const { resolve } = state.deleteConfirmation
      const opts = [
        {
          key: "c",
          exec: () => {
            dispatch({ type: "CLEAR_DELETE_CONFIRM" })
            setDeleteFocusedIndex(-1)
            resolve(false)
          },
        },
        {
          key: "d",
          exec: () => {
            dispatch({ type: "CLEAR_DELETE_CONFIRM" })
            setDeleteFocusedIndex(-1)
            resolve(true)
          },
        },
      ]
      if (key.name === "return") {
        if (deleteFocusedIndex >= 0) opts[deleteFocusedIndex]?.exec()
      } else if (key.name === "escape") {
        dispatch({ type: "CLEAR_DELETE_CONFIRM" })
        setDeleteFocusedIndex(-1)
        resolve(false)
      } else if (key.name === "h" || key.name === "left") {
        setDeleteFocusedIndex((i) => Math.max(-1, i - 1))
      } else if (key.name === "l" || key.name === "right") {
        setDeleteFocusedIndex((i) => Math.min(opts.length - 1, i + 1))
      } else {
        const match = opts.findIndex((o) => o.key === key.name)
        if (match !== -1) setDeleteFocusedIndex(match)
      }
      return true
    }

    // Bulk query update confirmation dialog
    if (state.bulkQueryUpdateConfirmation) {
      const { resolve, emptyFilter } = state.bulkQueryUpdateConfirmation
      const cancel = () => {
        dispatch({ type: "CLEAR_BULK_QUERY_UPDATE_CONFIRM" })
        setBulkQueryUpdateFocusedIndex(-1)
        setBulkQueryUpdateAwaitingFinal(false)
        resolve(false)
      }
      // Second stage: empty filter final confirm (y / c)
      if (bulkQueryUpdateAwaitingFinal) {
        const finalOpts = [
          {
            key: "y",
            exec: () => {
              dispatch({ type: "CLEAR_BULK_QUERY_UPDATE_CONFIRM" })
              setBulkQueryUpdateFocusedIndex(-1)
              setBulkQueryUpdateAwaitingFinal(false)
              resolve(true)
            },
          },
          { key: "c", exec: cancel },
        ]
        if (key.name === "escape") { cancel(); return true }
        if (key.name === "return") { if (bulkQueryUpdateFocusedIndex >= 0) finalOpts[bulkQueryUpdateFocusedIndex]?.exec() }
        else if (key.name === "h" || key.name === "left") setBulkQueryUpdateFocusedIndex((i) => Math.max(-1, i - 1))
        else if (key.name === "l" || key.name === "right") setBulkQueryUpdateFocusedIndex((i) => Math.min(finalOpts.length - 1, i + 1))
        else { const m = finalOpts.findIndex((o) => o.key === key.name); if (m !== -1) setBulkQueryUpdateFocusedIndex(m) }
        return true
      }
      // First stage
      const opts = [
        {
          key: "a",
          exec: () => {
            if (emptyFilter) {
              // Escalate to second confirm
              setBulkQueryUpdateFocusedIndex(-1)
              setBulkQueryUpdateAwaitingFinal(true)
            } else {
              dispatch({ type: "CLEAR_BULK_QUERY_UPDATE_CONFIRM" })
              setBulkQueryUpdateFocusedIndex(-1)
              resolve(true)
            }
          },
        },
        { key: "c", exec: cancel },
      ]
      if (key.name === "escape") { cancel() }
      else if (key.name === "return") { if (bulkQueryUpdateFocusedIndex >= 0) opts[bulkQueryUpdateFocusedIndex]?.exec() }
      else if (key.name === "h" || key.name === "left") setBulkQueryUpdateFocusedIndex((i) => Math.max(-1, i - 1))
      else if (key.name === "l" || key.name === "right") setBulkQueryUpdateFocusedIndex((i) => Math.min(opts.length - 1, i + 1))
      else { const match = opts.findIndex((o) => o.key === key.name); if (match !== -1) setBulkQueryUpdateFocusedIndex(match) }
      return true
    }

    // Bulk query delete confirmation dialog
    if (state.bulkQueryDeleteConfirmation) {
      const { resolve, emptyFilter } = state.bulkQueryDeleteConfirmation
      const cancel = () => {
        dispatch({ type: "CLEAR_BULK_QUERY_DELETE_CONFIRM" })
        setBulkQueryDeleteFocusedIndex(-1)
        setBulkQueryDeleteAwaitingFinal(false)
        resolve(false)
      }
      // Second stage: empty filter final confirm (y / c)
      if (bulkQueryDeleteAwaitingFinal) {
        const finalOpts = [
          {
            key: "y",
            exec: () => {
              dispatch({ type: "CLEAR_BULK_QUERY_DELETE_CONFIRM" })
              setBulkQueryDeleteFocusedIndex(-1)
              setBulkQueryDeleteAwaitingFinal(false)
              resolve(true)
            },
          },
          { key: "c", exec: cancel },
        ]
        if (key.name === "escape") { cancel(); return true }
        if (key.name === "return") { if (bulkQueryDeleteFocusedIndex >= 0) finalOpts[bulkQueryDeleteFocusedIndex]?.exec() }
        else if (key.name === "h" || key.name === "left") setBulkQueryDeleteFocusedIndex((i) => Math.max(-1, i - 1))
        else if (key.name === "l" || key.name === "right") setBulkQueryDeleteFocusedIndex((i) => Math.min(finalOpts.length - 1, i + 1))
        else { const m = finalOpts.findIndex((o) => o.key === key.name); if (m !== -1) setBulkQueryDeleteFocusedIndex(m) }
        return true
      }
      // First stage
      const opts = [
        {
          key: "d",
          exec: () => {
            if (emptyFilter) {
              // Escalate to second confirm
              setBulkQueryDeleteFocusedIndex(-1)
              setBulkQueryDeleteAwaitingFinal(true)
            } else {
              dispatch({ type: "CLEAR_BULK_QUERY_DELETE_CONFIRM" })
              setBulkQueryDeleteFocusedIndex(-1)
              resolve(true)
            }
          },
        },
        { key: "c", exec: cancel },
      ]
      if (key.name === "escape") { cancel() }
      else if (key.name === "return") { if (bulkQueryDeleteFocusedIndex >= 0) opts[bulkQueryDeleteFocusedIndex]?.exec() }
      else if (key.name === "h" || key.name === "left") setBulkQueryDeleteFocusedIndex((i) => Math.max(-1, i - 1))
      else if (key.name === "l" || key.name === "right") setBulkQueryDeleteFocusedIndex((i) => Math.min(opts.length - 1, i + 1))
      else { const m = opts.findIndex((o) => o.key === key.name); if (m !== -1) setBulkQueryDeleteFocusedIndex(m) }
      return true
    }

    return false
  }

  return {
    handleKey,
    pipelineFocusedIndex,
    bulkEditFocusedIndex,
    deleteFocusedIndex,
    bulkQueryUpdateFocusedIndex,
    bulkQueryUpdateAwaitingFinal,
    bulkQueryDeleteFocusedIndex,
    bulkQueryDeleteAwaitingFinal,
  }
}
