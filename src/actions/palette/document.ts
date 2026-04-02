/** Palette handlers: document operations (edit, insert, delete, bulk update/delete, export) */

import type { PaletteContext } from "./types"
import type { EditManyResult } from "../editMany"
import { openEditorForMany, openEditorForInsert, applyConfirmActions } from "../editMany"
import { showDeleteConfirm } from "../deleteConfirm"
import { runBulkQueryUpdate, runBulkQueryDelete } from "../bulkQueryConfirm"
import { resolveActiveFilter } from "../../utils/query"
import { exportDocuments, type ExportFormat } from "../export"

export function handleDocumentCommand(cmdId: string, ctx: PaletteContext): boolean {
  const { state, dispatch, renderer } = ctx

  switch (cmdId) {
    case "doc:edit": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) {
        return true
      }
      const cursorOnSelection = state.selectedRows.has(state.selectedIndex)
      const docsToEdit = cursorOnSelection
        ? state.documents.filter((_, i) => state.selectedRows.has(i))
        : [state.documents[state.selectedIndex]].filter(Boolean)
      if (docsToEdit.length === 0) {
        return true
      }

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
          if (outcome.cancelled) {
            return
          }
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
          showBulkConfirm(ctx, docsToEdit, result, editedDocs)
        })
        .catch((err: Error) => {
          renderer.resume()
          dispatch({ type: "SHOW_MESSAGE", message: `Edit failed: ${err.message}`, kind: "error" })
        })
      return true
    }
    case "doc:insert": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) {
        return true
      }
      const templateDoc = state.documents[state.selectedIndex]
      renderer.suspend()
      openEditorForInsert(activeTab.collectionName, state.dbName, templateDoc, state.schemaMap)
        .then((outcome) => {
          renderer.resume()
          if (outcome.cancelled) {
            return
          }
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
    case "doc:delete": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) {
        return true
      }
      const docsToDelete =
        state.selectedRows.size > 0
          ? state.documents.filter((_, i) => state.selectedRows.has(i))
          : [state.documents[state.selectedIndex]].filter(Boolean)
      if (docsToDelete.length === 0) {
        return true
      }
      showDeleteConfirm(activeTab.collectionName, docsToDelete, dispatch)
      return true
    }
    case "doc:bulk-query-update": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) {
        return true
      }
      const activeFilter = resolveActiveFilter(state)
      runBulkQueryUpdate(
        activeTab.collectionName,
        state.dbName,
        activeFilter,
        state.schemaMap,
        dispatch,
        renderer,
      )
      return true
    }
    case "doc:bulk-query-delete": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) {
        return true
      }
      const activeFilter = resolveActiveFilter(state)
      runBulkQueryDelete(
        activeTab.collectionName,
        state.dbName,
        activeFilter,
        state.schemaMap,
        dispatch,
        renderer,
      )
      return true
    }
    case "doc:export-json":
    case "doc:export-csv": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) {
        return true
      }
      if (state.exporting) {
        return true
      }
      const format: ExportFormat = cmdId === "doc:export-json" ? "json" : "csv"
      const selectedDocs =
        state.selectedRows.size > 0
          ? state.documents.filter((_, i) => state.selectedRows.has(i))
          : undefined
      startExport(format, activeTab.collectionName, ctx, selectedDocs)
      return true
    }
    default:
      return false
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

let activeExportAbort: AbortController | null = null

/** Get the active export abort controller (used by dialog keys to cancel) */
export function getExportAbort(): AbortController | null {
  return activeExportAbort
}

function startExport(
  format: ExportFormat,
  collectionName: string,
  ctx: PaletteContext,
  selectedDocs?: import("mongodb").Document[],
): void {
  const { state, dispatch } = ctx
  const abort = new AbortController()
  activeExportAbort = abort

  dispatch({ type: "START_EXPORT" })

  exportDocuments({
    format,
    collectionName,
    state,
    dispatch,
    signal: abort.signal,
    selectedDocs,
  })
    .catch((err: Error) => {
      if (!abort.signal.aborted) {
        dispatch({ type: "SHOW_MESSAGE", message: `Export failed: ${err.message}`, kind: "error" })
      }
    })
    .finally(() => {
      activeExportAbort = null
      dispatch({ type: "STOP_EXPORT" })
    })
}

/** Show the bulk-edit side-effect confirmation dialog (missing/added docs). */
function showBulkConfirm(
  ctx: PaletteContext,
  originalDocs: import("mongodb").Document[],
  result: EditManyResult,
  editedDocs: import("mongodb").Document[],
): void {
  const { state, dispatch, renderer } = ctx
  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
  if (!activeTab) {
    return
  }
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
          originalDocs,
          editedDocs,
          state.schemaMap,
        )
          .then(async (o2) => {
            renderer.resume()
            if (o2.cancelled) {
              return
            }
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
              showBulkConfirm(ctx, originalDocs, o2.result, o2.editedDocs)
            }
          })
          .catch((err: Error) => {
            renderer.resume()
            dispatch({
              type: "SHOW_MESSAGE",
              message: `Edit failed: ${err.message}`,
              kind: "error",
            })
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
          if (result.updated > 0) {
            parts.push(`${result.updated} updated`)
          }
          if (missingAction === "delete" && result.missing.length > 0) {
            parts.push(`${result.missing.length} deleted`)
          }
          if (addedAction === "insert" && result.added.length > 0) {
            parts.push(`${result.added.length} inserted`)
          }
          dispatch({ type: "SHOW_MESSAGE", message: parts.join(", ") || "Done", kind: "success" })
        }
        dispatch({ type: "FREEZE_SELECTION" })
        dispatch({ type: "RELOAD_DOCUMENTS" })
      },
    },
  })
}
