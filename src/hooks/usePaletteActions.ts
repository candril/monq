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
import { startWatching, stopWatching, reloadFromFile, openTmuxSplit } from "../actions/pipelineWatch"
import { openEditorForInsert } from "../actions/editMany"
import { disconnect, deleteDocument, listDatabases, switchDatabase } from "../providers/mongodb"
import { serializeDocument } from "../utils/document"
import { getNestedValue } from "../utils/format"
import { parseSimpleQueryFull, projectionToSimple } from "../query/parser"

interface UsePaletteActionsOptions {
  state: AppState
  dispatch: Dispatch<AppAction>
  renderer: CliRenderer
  setPaletteMode: (mode: "commands" | "collections" | "databases") => void
}

export function usePaletteActions({
  state,
  dispatch,
  renderer,
  setPaletteMode,
}: UsePaletteActionsOptions) {
  const handleSelect = useCallback(
    (cmd: Command) => {
      // Database selection
      if (cmd.id.startsWith("db:")) {
        const selectedDb = cmd.id.slice(3)
        switchDatabase(selectedDb)
        dispatch({ type: "SELECT_DATABASE", dbName: selectedDb })
        setPaletteMode("commands")
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
            const b64 = btoa(serializeDocument(doc))
            process.stdout.write(`\x1b]52;c;${b64}\x07`)
            dispatch({ type: "SHOW_MESSAGE", message: "Copied to clipboard", kind: "info" })
          }
          break
        }
        case "doc:copy-id": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const doc = state.documents[state.selectedIndex]
          if (doc?._id) {
            process.stdout.write(`\x1b]52;c;${btoa(String(doc._id))}\x07`)
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
              dispatch({ type: "SHOW_MESSAGE", message: `Insert failed: ${err.message}`, kind: "error" })
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
              focusedIndex: -1,
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
        case "doc:copy-cell": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const doc = state.documents[state.selectedIndex]
          if (!doc) break
          const visCols = state.columns.filter((c) => c.visible)
          const col = visCols[state.selectedColumnIndex]
          if (!col) break
          const val = getNestedValue(doc as Record<string, unknown>, col.field)
          const text =
            val === undefined
              ? ""
              : typeof val === "object" && val !== null
                ? JSON.stringify(val, null, 2)
                : String(val)
          process.stdout.write(`\x1b]52;c;${btoa(text)}\x07`)
          dispatch({ type: "SHOW_MESSAGE", message: `Copied ${col.field} to clipboard`, kind: "info" })
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
    [state, dispatch, renderer, setPaletteMode],
  )

  return { handleSelect }
}
