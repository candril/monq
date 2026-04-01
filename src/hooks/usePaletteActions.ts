/**
 * Hook: palette action dispatch
 * Handles all business logic triggered from the command palette.
 * App.tsx wires this hook and passes the result to CommandPalette.onSelect.
 */

import { useCallback, type Dispatch } from "react"
import type { CliRenderer } from "@opentui/core"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import type { Command } from "../commands/types"
import { editDocument } from "../actions/edit"
import { openPipelineEditor, writePipelineFile, pipelineFilePaths } from "../actions/pipeline"
import {
  startWatching,
  stopWatching,
  reloadFromFile,
  openTmuxSplit,
} from "../actions/pipelineWatch"
import { openEditorForInsert } from "../actions/editMany"
import { openEditorForIndexes } from "../actions/index"
import { openEditorForQueryUpdate, openEditorForQueryDelete } from "../actions/queryUpdate"
import { openExplainInEditor } from "../actions/explain"
import { explainFind, explainAggregate } from "../providers/mongodb"
import { resolveCurrentQuery } from "../utils/query"
import {
  promptCreateCollection,
  promptRenameCollection,
  promptDropCollection,
  promptDropDatabase,
} from "../actions/database"
import type { QueryUpdateReady } from "../actions/queryUpdate"
import type { Filter, Document } from "mongodb"
import { disconnect, deleteDocument, listDatabases, switchDatabase } from "../providers/mongodb"
import { switchConnection } from "../navigation"
import { serializeDocument } from "../utils/document"
import { getNestedValue } from "../utils/format"
import { copyToClipboard } from "../utils/clipboard"
import { parseSimpleQueryFull, parseBsonQuery, projectionToSimple } from "../query/parser"
import { findPreset } from "../themes/index"
import { setTheme, buildTheme } from "../theme"
import { saveStateTheme, clearStateTheme } from "../state/theme"
import type { ThemeConfig } from "../config/types"

interface UsePaletteActionsOptions {
  state: AppState
  dispatch: Dispatch<AppAction>
  renderer: CliRenderer
  setPaletteMode: (mode: "commands" | "collections" | "databases" | "themes") => void
  onThemeChange: (presetId: string) => void
  /** The preset ID from config.toml (null = none set). Used by the Reset command. */
  configThemeId: string | null
  /** The [theme] token overrides from config.toml. Re-applied over the reset preset. */
  configThemeOverrides: Partial<ThemeConfig>
  /** Handler to create a collection */
  onCreateCollection?: (collectionName: string) => Promise<string | null>
  /** Handler to rename a collection */
  onRenameCollection?: (oldName: string, newName: string) => Promise<string | null>
  /** Handler to drop a collection */
  onDropCollection?: (collectionName: string) => Promise<string | null>
  /** Handler to drop a database */
  onDropDatabase?: (dbName: string) => Promise<string | null>
}

export function usePaletteActions({
  state,
  dispatch,
  renderer,
  setPaletteMode,
  onThemeChange,
  configThemeId,
  configThemeOverrides,
  onCreateCollection,
  onRenameCollection,
  onDropCollection,
  onDropDatabase,
}: UsePaletteActionsOptions) {
  const handleSelect = useCallback(
    (cmd: Command) => {
      // Database selection — switch to collection picker after selecting
      if (cmd.id.startsWith("db:")) {
        const selectedDb = cmd.id.slice(3)
        switchDatabase(selectedDb)
        dispatch({ type: "SELECT_DATABASE", dbName: selectedDb })
        setPaletteMode("collections")
        return
      }

      // Theme selection / reset from theme picker sub-palette
      if (cmd.id.startsWith("theme:") && cmd.id !== "theme:pick") {
        // Reset to config/default
        if (cmd.id === "theme:reset") {
          const resetPresetId = configThemeId ?? "tokyo-night"
          const resetPreset = findPreset(resetPresetId)
          if (resetPreset) {
            setTheme(buildTheme({ ...resetPreset.theme, ...configThemeOverrides }))
            onThemeChange(resetPresetId)
          }
          clearStateTheme().catch(() => {})
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          setPaletteMode("commands")
          dispatch({ type: "SHOW_MESSAGE", message: "Theme reset to config default", kind: "info" })
          return
        }
        // Pick a preset
        const presetId = cmd.id.slice(6)
        const preset = findPreset(presetId)
        if (preset) {
          setTheme(buildTheme({ ...preset.theme, ...configThemeOverrides }))
          onThemeChange(presetId)
          saveStateTheme(presetId).catch(() => {})
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          setPaletteMode("commands")
          dispatch({ type: "SHOW_MESSAGE", message: `Theme: ${preset.name}`, kind: "info" })
        }
        return
      }

      // Collection selection
      if (cmd.id.startsWith("open:")) {
        dispatch({ type: "CLOSE_COMMAND_PALETTE" })
        setPaletteMode("commands")
        dispatch({ type: "OPEN_TAB", collectionName: cmd.id.slice(5) })
        return
      }

      switch (cmd.id) {
        case "nav:switch-connection":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          switchConnection()
          break

        case "nav:switch-database": {
          listDatabases()
            .then((databases) => {
              dispatch({ type: "SET_DATABASES", databases })
              setPaletteMode("databases")
            })
            .catch((err: Error) => {
              dispatch({ type: "CLOSE_COMMAND_PALETTE" })
              dispatch({ type: "SET_ERROR", error: `Failed to list databases: ${err.message}` })
            })
          break
        }
        case "nav:switch-collection":
          setPaletteMode("collections")
          break

        case "doc:edit": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const doc = state.documents[state.selectedIndex]
          const tab = state.tabs.find((t) => t.id === state.activeTabId)
          if (doc && tab) {
            renderer.suspend()
            editDocument(tab.collectionName, state.dbName, doc, state.schemaMap).finally(() => {
              renderer.resume()
              dispatch({ type: "RELOAD_DOCUMENTS" })
            })
          }
          break
        }
        case "doc:copy-json": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const doc = state.documents[state.selectedIndex]
          if (doc) {
            copyToClipboard(serializeDocument(doc)).catch(() => {})
            dispatch({ type: "SHOW_MESSAGE", message: "Copied to clipboard", kind: "info" })
          }
          break
        }
        case "doc:copy-id": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const doc = state.documents[state.selectedIndex]
          if (doc?._id) {
            copyToClipboard(String(doc._id)).catch(() => {})
            dispatch({ type: "SHOW_MESSAGE", message: "Copied _id", kind: "info" })
          }
          break
        }
        case "doc:filter-value":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "OPEN_QUERY" })
          break

        case "view:toggle-preview":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "TOGGLE_PREVIEW" })
          break
        case "view:cycle-preview":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "CYCLE_PREVIEW_POSITION" })
          break
        case "view:explain": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const activeTabExplain = state.tabs.find((t) => t.id === state.activeTabId)
          if (!activeTabExplain) break
          if (state.previewPosition && state.previewMode === "explain") {
            dispatch({ type: "TOGGLE_PREVIEW" })
            break
          }
          if (!state.previewPosition) dispatch({ type: "TOGGLE_PREVIEW" })
          dispatch({ type: "SET_PREVIEW_MODE", mode: "explain" })
          dispatch({ type: "SET_EXPLAIN_LOADING", loading: true })
          const query = resolveCurrentQuery(state)
          const explainPromise =
            query.mode === "aggregate"
              ? explainAggregate(activeTabExplain.collectionName, query.pipeline)
              : explainFind(activeTabExplain.collectionName, query.filter, {
                  sort: query.sort,
                  projection: query.projection,
                })
          explainPromise
            .then((result) => dispatch({ type: "SET_EXPLAIN_RESULT", result }))
            .catch((err: Error) => {
              dispatch({ type: "SET_EXPLAIN_LOADING", loading: false })
              dispatch({
                type: "SHOW_MESSAGE",
                message: `Explain failed: ${err.message}`,
                kind: "error",
              })
              dispatch({ type: "SET_PREVIEW_MODE", mode: "document" })
            })
          break
        }
        case "view:explain-raw": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const activeTabRaw = state.tabs.find((t) => t.id === state.activeTabId)
          if (!activeTabRaw) break
          const rawQuery = resolveCurrentQuery(state)
          renderer.suspend()
          const rawPromise =
            rawQuery.mode === "aggregate"
              ? explainAggregate(activeTabRaw.collectionName, rawQuery.pipeline)
              : explainFind(activeTabRaw.collectionName, rawQuery.filter, {
                  sort: rawQuery.sort,
                  projection: rawQuery.projection,
                })
          rawPromise
            .then((result) => openExplainInEditor(activeTabRaw.collectionName, result))
            .then(() => renderer.resume())
            .catch((err: Error) => {
              renderer.resume()
              dispatch({
                type: "SHOW_MESSAGE",
                message: `Explain failed: ${err.message}`,
                kind: "error",
              })
            })
          break
        }
        case "view:manage-indexes": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
          if (!activeTab) break
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
          break
        }
        case "view:toggle-filter-bar":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "TOGGLE_FILTER_BAR" })
          break
        case "view:reload":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "RELOAD_DOCUMENTS" })
          break
        case "view:cycle-column-mode":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "CYCLE_COLUMN_MODE" })
          break
        case "view:toggle-column-exclude": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const visCols = state.columns.filter((c) => c.visible)
          const col = visCols[state.selectedColumnIndex]
          if (!col) break
          const { projection: projObj } = parseSimpleQueryFull(state.queryInput)
          const proj: Record<string, 0 | 1> = { ...(projObj ?? {}) }
          if (proj[col.field] === 0) {
            delete proj[col.field]
          } else {
            delete proj[col.field]
            proj[col.field] = 0
          }
          const nonProjTokens = state.queryInput
            .trim()
            .split(/\s+/)
            .filter((t: string) => {
              if (!t) return false
              if (t.startsWith("+")) return false
              if (t.startsWith("-") && !/[><!:]/.test(t.slice(1))) return false
              return true
            })
          const projStr = Object.keys(proj).length > 0 ? " " + projectionToSimple(proj) : ""
          dispatch({ type: "SET_QUERY_INPUT", input: (nonProjTokens.join(" ") + projStr).trim() })
          dispatch({ type: "SUBMIT_QUERY" })
          break
        }

        case "query:open-filter":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "OPEN_QUERY" })
          break
        case "query:open-filter-bson":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "OPEN_QUERY_BSON" })
          break
        case "query:clear-filter":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "CLEAR_QUERY" })
          break
        case "query:format-bson":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "FORMAT_BSON_SECTION" })
          dispatch({ type: "OPEN_QUERY_BSON" })
          break
        case "query:sort": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const visCols = state.columns.filter((c) => c.visible)
          const sortCol = visCols[state.selectedColumnIndex]
          if (sortCol) dispatch({ type: "CYCLE_SORT", field: sortCol.field })
          break
        }
        case "query:clear-pipeline":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "CLEAR_PIPELINE" })
          break
        case "query:open-pipeline": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
          if (!activeTab) break
          renderer.suspend()
          openPipelineEditor({
            collectionName: activeTab.collectionName,
            dbName: state.dbName,
            tabId: activeTab.id,
            pipelineSource: state.pipelineSource,
            currentPipeline: state.pipeline,
            simpleQuery: state.queryInput,
            schemaMap: state.schemaMap,
            sortField: state.sortField,
            sortDirection: state.sortDirection,
          })
            .then((result) => {
              if (!result) return
              dispatch({
                type: "SET_PIPELINE",
                pipeline: result.pipeline,
                source: result.source,
                isAggregate: result.isAggregate,
              })
              const { queryFile } = pipelineFilePaths(
                state.dbName,
                activeTab.collectionName,
                activeTab.id,
              )
              startWatching(queryFile, () => reloadFromFile(queryFile, dispatch))
              dispatch({ type: "START_PIPELINE_WATCH" })
            })
            .catch((err: Error) => {
              dispatch({ type: "SET_ERROR", error: `Pipeline error: ${err.message}` })
            })
            .finally(() => renderer.resume())
          break
        }
        case "query:open-pipeline-tmux": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
          if (!activeTab) break
          writePipelineFile({
            collectionName: activeTab.collectionName,
            dbName: state.dbName,
            tabId: activeTab.id,
            pipelineSource: state.pipelineSource,
            currentPipeline: state.pipeline,
            simpleQuery: state.queryInput,
            schemaMap: state.schemaMap,
            sortField: state.pipeline.length > 0 ? null : state.sortField,
            sortDirection: state.sortDirection,
          })
            .then((queryFile) => {
              const result = openTmuxSplit(queryFile)
              if (result === "tmux") {
                startWatching(queryFile, () => reloadFromFile(queryFile, dispatch))
                dispatch({ type: "START_PIPELINE_WATCH" })
                dispatch({
                  type: "SHOW_MESSAGE",
                  message: "Opened in tmux split — watching for saves",
                  kind: "info",
                })
              } else if (result === "clipboard") {
                dispatch({
                  type: "SHOW_MESSAGE",
                  message: `Path copied to clipboard: ${queryFile}`,
                  kind: "info",
                })
              } else {
                dispatch({
                  type: "SHOW_MESSAGE",
                  message: `Pipeline file: ${queryFile}`,
                  kind: "info",
                })
              }
            })
            .catch(() => {})
          break
        }

        case "doc:insert": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
          if (!activeTab) break
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
          break
        }
        case "doc:delete": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
          if (!activeTab) break
          const docsToDelete =
            state.selectedRows.size > 0
              ? state.documents.filter((_, i) => state.selectedRows.has(i))
              : [state.documents[state.selectedIndex]].filter(Boolean)
          if (docsToDelete.length === 0) break
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
          break
        }
        case "doc:bulk-query-update": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
          if (!activeTab) break
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
                outcome as QueryUpdateReady
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
          break
        }

        case "doc:bulk-query-delete": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
          if (!activeTab) break
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
          break
        }

        case "doc:copy-cell": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const doc = state.documents[state.selectedIndex]
          if (!doc) break
          const visCols = state.columns.filter((c) => c.visible)
          const col = visCols[state.selectedColumnIndex]
          if (!col) break
          const val = getNestedValue(doc as Record<string, unknown>, col.field)
          const text =
            val === undefined || val === null
              ? ""
              : typeof val === "object" && "toHexString" in val
                ? (val as { toHexString(): string }).toHexString()
                : typeof val === "object"
                  ? JSON.stringify(val, null, 2)
                  : String(val)
          copyToClipboard(text).catch(() => {})
          dispatch({
            type: "SHOW_MESSAGE",
            message: `Copied ${col.field} to clipboard`,
            kind: "info",
          })
          break
        }

        case "tabs:clone":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "CLONE_TAB" })
          break
        case "tabs:close":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          if (state.activeTabId) dispatch({ type: "CLOSE_TAB", tabId: state.activeTabId })
          break
        case "tabs:undo-close":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "UNDO_CLOSE_TAB" })
          break
        case "tabs:prev": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const currentIndex = state.tabs.findIndex((t) => t.id === state.activeTabId)
          if (currentIndex > 0) {
            stopWatching()
            dispatch({ type: "STOP_PIPELINE_WATCH" })
            dispatch({ type: "SWITCH_TAB", tabId: state.tabs[currentIndex - 1].id })
          }
          break
        }
        case "tabs:next": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const currentIndex = state.tabs.findIndex((t) => t.id === state.activeTabId)
          if (currentIndex < state.tabs.length - 1) {
            stopWatching()
            dispatch({ type: "STOP_PIPELINE_WATCH" })
            dispatch({ type: "SWITCH_TAB", tabId: state.tabs[currentIndex + 1].id })
          }
          break
        }

        case "selection:enter":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "ENTER_SELECTION_MODE" })
          break
        case "selection:freeze":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "FREEZE_SELECTION" })
          break
        case "selection:exit":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "EXIT_SELECTION_MODE" })
          break
        case "selection:select-all":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "SELECT_ALL" })
          break

        case "manage:create-collection": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          setPaletteMode("commands")
          if (!onCreateCollection) break
          promptCreateCollection(dispatch, onCreateCollection)
          break
        }

        case "manage:rename-collection": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          setPaletteMode("commands")
          const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
          if (!activeTab || !onRenameCollection) break
          promptRenameCollection(dispatch, activeTab.collectionName, onRenameCollection)
          break
        }

        case "manage:drop-collection": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          setPaletteMode("commands")
          const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
          if (!activeTab || !onDropCollection) break
          promptDropCollection(dispatch, activeTab.collectionName, onDropCollection)
          break
        }

        case "manage:drop-database": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          setPaletteMode("commands")
          if (!state.dbName || !onDropDatabase) break
          promptDropDatabase(dispatch, state.dbName, onDropDatabase)
          break
        }

        case "theme:pick":
          setPaletteMode("themes")
          break

        case "app:quit":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          stopWatching()
          disconnect().catch(() => {})
          renderer.destroy()
          process.exit(0)
          break

        default:
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      }
    },
    [
      state,
      dispatch,
      renderer,
      setPaletteMode,
      onThemeChange,
      configThemeId,
      configThemeOverrides,
      onCreateCollection,
      onRenameCollection,
      onDropCollection,
      onDropDatabase,
    ],
  )

  return { handleSelect }
}
