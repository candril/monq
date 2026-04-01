/**
 * Hook: keyboard handling for document edit, insert, and delete actions.
 * Covers: e (edit), i (insert), D (shift+d, delete).
 * Returns true if the key was consumed.
 */

import type { Dispatch } from "react"
import type { CliRenderer } from "@opentui/core"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import type { Keymap } from "../config/types"
import { matches } from "../utils/keymap"
import type { EditManyResult } from "../actions/editMany"
import { deleteDocument } from "../providers/mongodb"
import { openEditorForMany, openEditorForInsert, applyConfirmActions } from "../actions/editMany"
import { openEditorForQueryUpdate, openEditorForQueryDelete } from "../actions/queryUpdate"
import { openEditorForIndexes } from "../actions/index"
import { explainFind, explainAggregate } from "../providers/mongodb"
import { resolveCurrentQuery } from "../utils/query"
import { openExplainInEditor } from "../actions/explain"
import { parseSimpleQueryFull, parseBsonQuery } from "../query/parser"
import type { Filter } from "mongodb"
import type { Document } from "mongodb"

interface UseDocumentEditKeysOptions {
  state: AppState
  dispatch: Dispatch<AppAction>
  renderer: CliRenderer
  keymap: Keymap
}

export function useDocumentEditKeys({
  state,
  dispatch,
  renderer,
  keymap,
}: UseDocumentEditKeysOptions) {
  function handleKey(key: { name: string; ctrl?: boolean; shift?: boolean }): boolean {
    if (state.view !== "documents") return false
    if (state.commandPaletteVisible) return false
    if (state.queryVisible) return false

    // doc.edit: edit document(s)
    if (matches(key, keymap["doc.edit"])) {
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

    // doc.insert: insert document
    if (matches(key, keymap["doc.insert"])) {
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

    // doc.delete: delete document(s)
    if (matches(key, keymap["doc.delete"])) {
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

    // doc.bulk_query_update: open $EDITOR for updateMany
    if (matches(key, keymap["doc.bulk_query_update"])) {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) return true

      // Derive the active filter from query state
      let activeFilter: Filter<Document> = {}
      try {
        if (state.queryInput.trim()) {
          if (state.queryMode === "bson") {
            activeFilter = parseBsonQuery(state.queryInput)
          } else {
            activeFilter = parseSimpleQueryFull(state.queryInput, state.schemaMap).filter
          }
        }
      } catch {
        // Invalid query — use empty filter
      }

      renderer.suspend()
      openEditorForQueryUpdate(
        activeTab.collectionName,
        state.dbName,
        activeFilter,
        state.schemaMap,
      )
        .then((outcome) => {
          renderer.resume()
          if (outcome.cancelled) return
          if ("emptyUpdate" in outcome && outcome.emptyUpdate) {
            dispatch({
              type: "SHOW_MESSAGE",
              message: "Nothing to update — add fields to $set (or another operator)",
              kind: "info",
            })
            return
          }
          const { filter, update, upsert, matchedCount, apply, collectionName } =
            outcome as import("../actions/queryUpdate").QueryUpdateReady
          dispatch({
            type: "SHOW_BULK_QUERY_UPDATE_CONFIRM",
            confirmation: {
              collectionName,
              filter,
              update,
              upsert,
              matchedCount,
              emptyFilter: Object.keys(filter).length === 0,
              resolve: async (confirmed) => {
                if (!confirmed) return
                try {
                  const result = await apply()
                  if (result.matchedCount === 0) {
                    dispatch({
                      type: "SHOW_MESSAGE",
                      message: "No documents matched",
                      kind: "warning",
                    })
                  } else if (result.modifiedCount === 0 && result.upsertedCount === 0) {
                    dispatch({
                      type: "SHOW_MESSAGE",
                      message: "No documents modified",
                      kind: "info",
                    })
                  } else {
                    const parts: string[] = []
                    if (result.modifiedCount > 0) parts.push(`Updated ${result.modifiedCount}`)
                    if (result.upsertedCount > 0) parts.push(`Upserted ${result.upsertedCount}`)
                    parts.push(`/ matched ${result.matchedCount}`)
                    dispatch({
                      type: "SHOW_MESSAGE",
                      message: parts.join(" "),
                      kind: "success",
                    })
                  }
                  dispatch({ type: "RELOAD_DOCUMENTS" })
                } catch (err) {
                  dispatch({
                    type: "SHOW_MESSAGE",
                    message: `Update failed: ${(err as Error).message}`,
                    kind: "error",
                  })
                }
              },
            },
          })
        })
        .catch((err: Error) => {
          renderer.resume()
          dispatch({
            type: "SHOW_MESSAGE",
            message: `Bulk update failed: ${err.message}`,
            kind: "error",
          })
        })
      return true
    }

    // doc.bulk_query_delete: open $EDITOR for deleteMany
    if (matches(key, keymap["doc.bulk_query_delete"])) {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) return true

      let activeFilter: Filter<Document> = {}
      try {
        if (state.queryInput.trim()) {
          if (state.queryMode === "bson") {
            activeFilter = parseBsonQuery(state.queryInput)
          } else {
            activeFilter = parseSimpleQueryFull(state.queryInput, state.schemaMap).filter
          }
        }
      } catch {
        // use empty filter
      }

      renderer.suspend()
      openEditorForQueryDelete(
        activeTab.collectionName,
        state.dbName,
        activeFilter,
        state.schemaMap,
      )
        .then((outcome) => {
          renderer.resume()
          if (outcome.cancelled) return
          const { filter, matchedCount, apply, collectionName } = outcome
          dispatch({
            type: "SHOW_BULK_QUERY_DELETE_CONFIRM",
            confirmation: {
              collectionName,
              filter,
              matchedCount,
              emptyFilter: Object.keys(filter).length === 0,
              resolve: async (confirmed) => {
                if (!confirmed) return
                try {
                  const result = await apply()
                  dispatch({
                    type: "SHOW_MESSAGE",
                    message: `Deleted ${result.deletedCount} document${result.deletedCount === 1 ? "" : "s"}`,
                    kind: result.deletedCount > 0 ? "success" : "info",
                  })
                  dispatch({ type: "RELOAD_DOCUMENTS" })
                } catch (err) {
                  dispatch({
                    type: "SHOW_MESSAGE",
                    message: `Delete failed: ${(err as Error).message}`,
                    kind: "error",
                  })
                }
              },
            },
          })
        })
        .catch((err: Error) => {
          renderer.resume()
          dispatch({
            type: "SHOW_MESSAGE",
            message: `Bulk delete failed: ${err.message}`,
            kind: "error",
          })
        })
      return true
    }

    // index.open: open index editor
    if (matches(key, keymap["index.open"])) {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) return true
      renderer.suspend()
      openEditorForIndexes(activeTab.collectionName, state.dbName, state.schemaMap)
        .then((outcome) => {
          renderer.resume()
          if (outcome.cancelled) return
          const { toCreate, toDrop, toReplace, apply } = outcome
          dispatch({
            type: "SHOW_INDEX_CREATE_CONFIRM",
            confirmation: {
              toCreate,
              toDrop,
              toReplace,
              resolve: async (confirmed) => {
                if (!confirmed) return
                const result = await apply()
                if (result.errors.length > 0) {
                  dispatch({ type: "SHOW_MESSAGE", message: result.errors[0], kind: "error" })
                } else {
                  const parts: string[] = []
                  if (result.created > 0) parts.push(`Created ${result.created}`)
                  if (result.dropped > 0) parts.push(`Dropped ${result.dropped}`)
                  dispatch({
                    type: "SHOW_MESSAGE",
                    message: parts.join(", ") || "No changes",
                    kind: "success",
                  })
                }
              },
            },
          })
        })
        .catch((err: Error) => {
          renderer.resume()
          dispatch({
            type: "SHOW_MESSAGE",
            message: `Index editor failed: ${err.message}`,
            kind: "error",
          })
        })
      return true
    }

    // explain.run: toggle explain panel
    if (matches(key, keymap["explain.run"])) {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) return true

      // If explain is visible, close the panel entirely
      if (state.previewPosition && state.previewMode === "explain") {
        dispatch({ type: "TOGGLE_PREVIEW" })
        return true
      }

      // Open panel in explain mode (or switch from document to explain)
      if (!state.previewPosition) {
        dispatch({ type: "TOGGLE_PREVIEW" })
      }
      dispatch({ type: "SET_PREVIEW_MODE", mode: "explain" })
      dispatch({ type: "SET_EXPLAIN_LOADING", loading: true })

      const query = resolveCurrentQuery(state)

      const promise =
        query.mode === "aggregate"
          ? explainAggregate(activeTab.collectionName, query.pipeline)
          : explainFind(activeTab.collectionName, query.filter, {
              sort: query.sort,
              projection: query.projection,
            })

      promise
        .then((result) => {
          dispatch({ type: "SET_EXPLAIN_RESULT", result })
        })
        .catch((err: Error) => {
          dispatch({ type: "SET_EXPLAIN_LOADING", loading: false })
          dispatch({
            type: "SHOW_MESSAGE",
            message: `Explain failed: ${err.message}`,
            kind: "error",
          })
          dispatch({ type: "SET_PREVIEW_MODE", mode: "document" })
        })

      return true
    }

    // explain.raw: open full explain JSON in $EDITOR
    if (matches(key, keymap["explain.raw"])) {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) return true

      const query = resolveCurrentQuery(state)
      renderer.suspend()

      const promise =
        query.mode === "aggregate"
          ? explainAggregate(activeTab.collectionName, query.pipeline)
          : explainFind(activeTab.collectionName, query.filter, {
              sort: query.sort,
              projection: query.projection,
            })

      promise
        .then((result) => openExplainInEditor(activeTab.collectionName, result))
        .then(() => {
          renderer.resume()
        })
        .catch((err: Error) => {
          renderer.resume()
          dispatch({
            type: "SHOW_MESSAGE",
            message: `Explain failed: ${err.message}`,
            kind: "error",
          })
        })

      return true
    }

    return false
  }

  // Helper: show bulk-edit side-effect confirmation — kept local to this hook.
  // originalDocs: the true source of truth from the first editor open (never changes).
  // editedDocs: what the user last saved (shown in the editor on goBack).
  function showBulkConfirm(
    result: EditManyResult,
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
            editedDocs, // show what the user last saved
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
