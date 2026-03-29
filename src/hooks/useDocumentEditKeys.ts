/**
 * Hook: keyboard handling for document edit, insert, and delete actions.
 * Covers: e (edit), i (insert), D (shift+d, delete).
 * Returns true if the key was consumed.
 */

import type { Dispatch } from "react"
import type { CliRenderer } from "@opentui/core"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { deleteDocument } from "../providers/mongodb"
import { openEditorForMany, openEditorForInsert, applyConfirmActions } from "../actions/editMany"

interface UseDocumentEditKeysOptions {
  state: AppState
  dispatch: Dispatch<AppAction>
  renderer: CliRenderer
}

export function useDocumentEditKeys({ state, dispatch, renderer }: UseDocumentEditKeysOptions) {
  function handleKey(key: { name: string; ctrl?: boolean; shift?: boolean }): boolean {
    if (state.view !== "documents") return false

    // e: edit document(s)
    if (key.name === "e" && !key.ctrl && !key.shift) {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) return true
      const cursorOnSelection = state.selectedRows.has(state.selectedIndex)
      const docsToEdit = cursorOnSelection
        ? state.documents.filter((_, i) => state.selectedRows.has(i))
        : [state.documents[state.selectedIndex]].filter(Boolean)
      if (docsToEdit.length === 0) return true

      renderer.suspend()
      openEditorForMany(
        activeTab.collectionName,
        state.dbName,
        docsToEdit,
        undefined,
        state.schemaMap,
      )
        .then(async (outcome) => {
          renderer.resume()
          if (outcome.cancelled) return
          const { result, applyEdits, editedDocs } = outcome
          if (result.errors.length > 0) {
            dispatch({ type: "SHOW_MESSAGE", message: result.errors[0], kind: "error" })
            return
          }
          await applyEdits()
          const hasSideEffects = result.missing.length > 0 || result.added.length > 0
          if (!hasSideEffects) {
            const n = result.updated
            dispatch({
              type: "SHOW_MESSAGE",
              message: n > 0 ? `Updated ${n} document${n === 1 ? "" : "s"}` : "No changes",
              kind: n > 0 ? "success" : "info",
            })
            dispatch({ type: "FREEZE_SELECTION" })
            dispatch({ type: "RELOAD_DOCUMENTS" })
            return
          }
          showBulkConfirm(result, docsToEdit, editedDocs)
        })
        .catch((err: Error) => {
          renderer.resume()
          dispatch({ type: "SHOW_MESSAGE", message: `Edit failed: ${err.message}`, kind: "error" })
        })
      return true
    }

    // i: insert document
    if (key.name === "i" && !key.ctrl && !key.shift) {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) return true
      const templateDoc = state.documents[state.selectedIndex]
      renderer.suspend()
      openEditorForInsert(activeTab.collectionName, state.dbName, templateDoc, state.schemaMap)
        .then((outcome) => {
          renderer.resume()
          if (outcome.cancelled) return
          if (outcome.errors.length > 0) {
            dispatch({ type: "SHOW_MESSAGE", message: outcome.errors[0], kind: "error" })
          } else if (outcome.inserted > 0) {
            dispatch({
              type: "SHOW_MESSAGE",
              message: `Inserted ${outcome.inserted} document${outcome.inserted === 1 ? "" : "s"}`,
              kind: "success",
            })
            dispatch({ type: "RELOAD_DOCUMENTS" })
          } else {
            dispatch({ type: "SHOW_MESSAGE", message: "No documents inserted", kind: "info" })
          }
        })
        .catch((err: Error) => {
          renderer.resume()
          dispatch({
            type: "SHOW_MESSAGE",
            message: `Insert failed: ${err.message}`,
            kind: "error",
          })
        })
      return true
    }

    // D (shift+d): delete document(s)
    if (key.name === "d" && key.shift) {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) return true
      const docsToDelete =
        state.selectedRows.size > 0
          ? state.documents.filter((_, i) => state.selectedRows.has(i))
          : [state.documents[state.selectedIndex]].filter(Boolean)
      if (docsToDelete.length === 0) return true
      dispatch({
        type: "SHOW_DELETE_CONFIRM",
        confirmation: {
          docs: docsToDelete,
          resolve: async (confirmed) => {
            if (!confirmed) return
            const errors: string[] = []
            for (const doc of docsToDelete) {
              try {
                await deleteDocument(activeTab.collectionName, doc._id)
              } catch (err) {
                errors.push(`Delete failed: ${(err as Error).message}`)
              }
            }
            if (errors.length > 0) {
              dispatch({ type: "SHOW_MESSAGE", message: errors[0], kind: "error" })
            } else {
              const n = docsToDelete.length
              dispatch({
                type: "SHOW_MESSAGE",
                message: `Deleted ${n} document${n === 1 ? "" : "s"}`,
                kind: "success",
              })
              dispatch({ type: "EXIT_SELECTION_MODE" })
            }
            dispatch({ type: "RELOAD_DOCUMENTS" })
          },
        },
      })
      return true
    }

    return false
  }

  // Helper: show bulk-edit side-effect confirmation — kept local to this hook.
  // originalDocs: the true source of truth from the first editor open (never changes).
  // editedDocs: what the user last saved (shown in the editor on goBack).
  function showBulkConfirm(
    result: any,
    originalDocs: import("mongodb").Document[],
    editedDocs: import("mongodb").Document[],
  ): void {
    const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
    if (!activeTab) return
    dispatch({
      type: "SHOW_BULK_EDIT_CONFIRM",
      confirmation: {
        missing: result.missing,
        added: result.added,
        goBack: () => {
          renderer.suspend()
          openEditorForMany(
            activeTab.collectionName,
            state.dbName,
            originalDocs, // always diff against the original set
            editedDocs,   // show what the user last saved
            state.schemaMap,
          )
            .then(async (o2) => {
              renderer.resume()
              if (o2.cancelled) return
              await o2.applyEdits()
              if (o2.result.missing.length === 0 && o2.result.added.length === 0) {
                const n2 = o2.result.updated
                dispatch({
                  type: "SHOW_MESSAGE",
                  message: n2 > 0 ? `Updated ${n2} document${n2 === 1 ? "" : "s"}` : "No changes",
                  kind: n2 > 0 ? "success" : "info",
                })
                dispatch({ type: "FREEZE_SELECTION" })
                dispatch({ type: "RELOAD_DOCUMENTS" })
              } else {
                showBulkConfirm(o2.result, originalDocs, o2.editedDocs)
              }
            })
            .catch((err: Error) => {
              renderer.resume()
              dispatch({ type: "SHOW_MESSAGE", message: `Edit failed: ${err.message}`, kind: "error" })
            })
        },
        resolve: async (missingAction, addedAction) => {
          const errors = await applyConfirmActions(
            activeTab.collectionName,
            result,
            missingAction,
            addedAction,
          )
          if (errors.length > 0) {
            dispatch({ type: "SHOW_MESSAGE", message: errors[0], kind: "error" })
          } else {
            const parts: string[] = []
            if (result.updated > 0) parts.push(`${result.updated} updated`)
            if (missingAction === "delete" && result.missing.length > 0)
              parts.push(`${result.missing.length} deleted`)
            if (addedAction === "insert" && result.added.length > 0)
              parts.push(`${result.added.length} inserted`)
            dispatch({ type: "SHOW_MESSAGE", message: parts.join(", ") || "Done", kind: "success" })
          }
          dispatch({ type: "FREEZE_SELECTION" })
          dispatch({ type: "RELOAD_DOCUMENTS" })
        },
      },
    })
  }

  return { handleKey }
}
