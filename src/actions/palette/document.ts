/** Palette handlers: document operations (insert, delete, bulk update/delete) */

import type { PaletteContext } from "./types"
import { openEditorForInsert } from "../editMany"
import { showDeleteConfirm } from "../deleteConfirm"
import { runBulkQueryUpdate, runBulkQueryDelete } from "../bulkQueryConfirm"
import { resolveActiveFilter } from "../../utils/query"

export function handleDocumentCommand(cmdId: string, ctx: PaletteContext): boolean {
  const { state, dispatch, renderer } = ctx

  switch (cmdId) {
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
    default:
      return false
  }
}
