/**
 * Hook: keyboard handling for modal confirmation dialogs.
 * Covers pipeline-confirm, bulk-edit-confirm, delete-confirm,
 * bulk-query-update-confirm, bulk-query-delete-confirm, and index-create-confirm.
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

type DialogOption = { key: string; exec: () => void }
type Key = { name: string; ctrl?: boolean; shift?: boolean }

/**
 * Shared dialog keyboard navigation.
 * Handles h/l/left/right to move focus, Enter to confirm, escape to cancel,
 * and letter-key shortcuts to jump to an option.
 */
function handleDialogNav(
  key: Key,
  opts: DialogOption[],
  focusedIndex: number,
  setFocusedIndex: (fn: (i: number) => number) => void,
  onEscape?: () => void,
): void {
  if (key.name === "escape") {
    onEscape?.()
  } else if (key.name === "return") {
    if (focusedIndex >= 0) {
      opts[focusedIndex]?.exec()
    }
  } else if (key.name === "h" || key.name === "left") {
    setFocusedIndex((i) => Math.max(-1, i - 1))
  } else if (key.name === "l" || key.name === "right") {
    setFocusedIndex((i) => Math.min(opts.length - 1, i + 1))
  } else {
    const match = opts.findIndex((o) => o.key === key.name)
    if (match !== -1) {
      setFocusedIndex(() => match)
    }
  }
}

export function useDialogKeys({ state, dispatch }: UseDialogKeysOptions) {
  const [pipelineFocusedIndex, setPipelineFocusedIndex] = useState(-1)
  const [bulkEditFocusedIndex, setBulkEditFocusedIndex] = useState(-1)
  const [deleteFocusedIndex, setDeleteFocusedIndex] = useState(-1)
  const [bulkQueryUpdateFocusedIndex, setBulkQueryUpdateFocusedIndex] = useState(-1)
  const [bulkQueryUpdateAwaitingFinal, setBulkQueryUpdateAwaitingFinal] = useState(false)
  const [bulkQueryDeleteFocusedIndex, setBulkQueryDeleteFocusedIndex] = useState(-1)
  const [bulkQueryDeleteAwaitingFinal, setBulkQueryDeleteAwaitingFinal] = useState(false)
  const [indexCreateFocusedIndex, setIndexCreateFocusedIndex] = useState(-1)
  const [exportCancelFocusedIndex, setExportCancelFocusedIndex] = useState(-1)

  function handleKey(key: Key): boolean {
    // Pipeline→simple confirmation dialog
    if (state.pipelineConfirm) {
      const confirm = state.pipelineConfirm
      const opts: DialogOption[] = [
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
      handleDialogNav(key, opts, pipelineFocusedIndex, setPipelineFocusedIndex, () => {
        dispatch({ type: "DISMISS_PIPELINE_CONFIRM" })
        setPipelineFocusedIndex(-1)
      })
      return true
    }

    // Bulk edit confirmation dialog
    if (state.bulkEditConfirmation) {
      const { resolve, goBack, missing, added } = state.bulkEditConfirmation
      const reset = () => {
        dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" })
        setBulkEditFocusedIndex(-1)
      }
      const opts: DialogOption[] = [
        {
          key: "b",
          exec: () => {
            reset()
            goBack()
          },
        },
        {
          key: "i",
          exec: () => {
            reset()
            resolve("ignore", "ignore")
          },
        },
      ]
      if (missing.length > 0) {
        opts.push({
          key: "d",
          exec: () => {
            reset()
            resolve("delete", "ignore")
          },
        })
      }
      if (added.length > 0) {
        opts.push({
          key: "a",
          exec: () => {
            reset()
            resolve("ignore", "insert")
          },
        })
      }
      if (missing.length > 0 && added.length > 0) {
        opts.push({
          key: "x",
          exec: () => {
            reset()
            resolve("delete", "insert")
          },
        })
      }
      opts.push({ key: "c", exec: reset })
      handleDialogNav(key, opts, bulkEditFocusedIndex, setBulkEditFocusedIndex)
      return true
    }

    // Delete confirmation dialog
    if (state.deleteConfirmation) {
      const { resolve } = state.deleteConfirmation
      const cancel = () => {
        dispatch({ type: "CLEAR_DELETE_CONFIRM" })
        setDeleteFocusedIndex(-1)
        resolve(false)
      }
      const opts: DialogOption[] = [
        { key: "c", exec: cancel },
        {
          key: "d",
          exec: () => {
            dispatch({ type: "CLEAR_DELETE_CONFIRM" })
            setDeleteFocusedIndex(-1)
            resolve(true)
          },
        },
      ]
      handleDialogNav(key, opts, deleteFocusedIndex, setDeleteFocusedIndex, cancel)
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
      if (bulkQueryUpdateAwaitingFinal) {
        const finalOpts: DialogOption[] = [
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
        handleDialogNav(
          key,
          finalOpts,
          bulkQueryUpdateFocusedIndex,
          setBulkQueryUpdateFocusedIndex,
          cancel,
        )
        return true
      }
      const opts: DialogOption[] = [
        {
          key: "a",
          exec: () => {
            if (emptyFilter) {
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
      handleDialogNav(
        key,
        opts,
        bulkQueryUpdateFocusedIndex,
        setBulkQueryUpdateFocusedIndex,
        cancel,
      )
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
      if (bulkQueryDeleteAwaitingFinal) {
        const finalOpts: DialogOption[] = [
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
        handleDialogNav(
          key,
          finalOpts,
          bulkQueryDeleteFocusedIndex,
          setBulkQueryDeleteFocusedIndex,
          cancel,
        )
        return true
      }
      const opts: DialogOption[] = [
        {
          key: "d",
          exec: () => {
            if (emptyFilter) {
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
      handleDialogNav(
        key,
        opts,
        bulkQueryDeleteFocusedIndex,
        setBulkQueryDeleteFocusedIndex,
        cancel,
      )
      return true
    }

    // Index create confirmation dialog
    if (state.indexCreateConfirmation) {
      const { resolve } = state.indexCreateConfirmation
      const cancel = () => {
        dispatch({ type: "CLEAR_INDEX_CREATE_CONFIRM" })
        setIndexCreateFocusedIndex(-1)
        resolve(false)
      }
      const opts: DialogOption[] = [
        { key: "c", exec: cancel },
        {
          key: "a",
          exec: () => {
            dispatch({ type: "CLEAR_INDEX_CREATE_CONFIRM" })
            setIndexCreateFocusedIndex(-1)
            resolve(true)
          },
        },
      ]
      handleDialogNav(key, opts, indexCreateFocusedIndex, setIndexCreateFocusedIndex, cancel)
      return true
    }

    // Export cancel confirmation dialog
    if (state.exportCancelConfirmation) {
      const { resolve } = state.exportCancelConfirmation
      const dismiss = () => {
        dispatch({ type: "CLEAR_EXPORT_CANCEL_CONFIRM" })
        setExportCancelFocusedIndex(-1)
        resolve(false)
      }
      const opts: DialogOption[] = [
        { key: "k", exec: dismiss },
        {
          key: "c",
          exec: () => {
            dispatch({ type: "CLEAR_EXPORT_CANCEL_CONFIRM" })
            setExportCancelFocusedIndex(-1)
            resolve(true)
          },
        },
      ]
      handleDialogNav(key, opts, exportCancelFocusedIndex, setExportCancelFocusedIndex, dismiss)
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
    indexCreateFocusedIndex,
    exportCancelFocusedIndex,
  }
}
