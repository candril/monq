/**
 * Hook: Keyboard navigation
 * Handles global keys — quit, open palette, document navigation.
 * Does NOT handle input when command palette or query bar is open.
 */

import type { Dispatch, RefObject } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"

import { ObjectId } from "mongodb"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { disconnect, serializeDocument, deleteDocument } from "../providers/mongodb"
import { openPipelineEditor, writePipelineFile, pipelineFilePaths, extractFindParts, classifyPipeline } from "../actions/pipeline"
import { startWatching, stopWatching, reloadFromFile, openTmuxSplit } from "../actions/pipelineWatch"
import { openEditorForMany, openEditorForInsert, applyConfirmActions } from "../actions/editMany"
import { filterToSimple, projectionToSimple, parseSimpleQueryFull } from "../query/parser"
import { formatValue } from "../utils/format"

interface UseKeyboardNavOptions {
  state: AppState
  dispatch: Dispatch<AppAction>
  docListScrollRef: RefObject<ScrollBoxRenderable>
}

/** Build +field/-field projection tokens from a $project object */
function buildProjSuffix(projection: Document | undefined): string {
  if (!projection || typeof projection !== "object") return ""
  const entries = Object.entries(projection as Record<string, unknown>)
    .filter(([, v]) => v === 0 || v === 1) as [string, 0 | 1][]
  if (entries.length === 0) return ""
  return " " + projectionToSimple(Object.fromEntries(entries) as Record<string, 0 | 1>)
}

/** Get a nested value from a document */
function getNestedValue(doc: Record<string, unknown>, field: string): unknown {
  const parts = field.split(".")
  let current: unknown = doc
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function useKeyboardNav({ state, dispatch, docListScrollRef }: UseKeyboardNavOptions) {
  const renderer = useRenderer()

  useKeyboard((key) => {
    // Open command palette (always available)
    if (key.ctrl && key.name === "p") {
      dispatch({ type: "OPEN_COMMAND_PALETTE" })
      return
    }

    // Ctrl+D / Ctrl+U: half-page scroll (nvim behaviour)
    // Cursor moves by half the viewport, scroll moves by the same amount.
    if ((key.ctrl && key.name === "d") || (key.ctrl && key.name === "u")) {
      if (state.view !== "documents") return
      const scrollbox = docListScrollRef.current
      if (!scrollbox) return
      const viewportHeight = scrollbox.viewport?.height ?? 20
      const half = Math.floor(viewportHeight / 2)
      const dir = key.name === "d" ? 1 : -1
      const newIndex = Math.max(0, Math.min(state.documents.length - 1, state.selectedIndex + dir * half))
      const newScrollTop = Math.max(0, scrollbox.scrollTop + dir * half)
      dispatch({ type: "SELECT_DOCUMENT", index: newIndex })
      scrollbox.scrollTo(newScrollTop)
      // Trigger load-more if scrolling down near the end
      if (dir === 1 && !state.loadingMore && state.loadedCount < state.documentCount &&
          newIndex >= state.documents.length - 10) {
        dispatch({ type: "LOAD_MORE" })
      }
      return
    }

    // Ctrl+F: open pipeline editor in $EDITOR (blocking, renderer suspended)
    if (key.ctrl && key.name === "f") {
      if (state.view !== "documents" || !state.activeTabId) return
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) return

      stopWatching()
      renderer.suspend()
      openPipelineEditor({
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
        .then((result) => {
          if (!result) return
          dispatch({
            type: "SET_PIPELINE",
            pipeline: result.pipeline,
            source: result.source,
            isAggregate: result.isAggregate,
          })
          // Start watching for external saves after returning from editor
          const { queryFile } = pipelineFilePaths(state.dbName, activeTab.collectionName, activeTab.id)
          startWatching(queryFile, () => {
            reloadFromFile(queryFile, dispatch)
          })
          dispatch({ type: "START_PIPELINE_WATCH" })
        })
        .catch((err: Error) => {
          dispatch({ type: "SET_ERROR", error: `Pipeline error: ${err.message}` })
        })
        .finally(() => {
          renderer.resume()
        })
      return
    }

    // Ctrl+E: open pipeline file in tmux split (non-blocking) or copy path to clipboard
    if (key.ctrl && key.name === "e") {
      if (state.view !== "documents" || !state.activeTabId) return
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) return

      // Write the pipeline file (template if no active pipeline) then open split
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
            dispatch({ type: "SHOW_MESSAGE", message: `Opened in tmux split — watching for saves`, kind: "info" })
          } else if (result === "clipboard") {
            dispatch({ type: "SHOW_MESSAGE", message: `Path copied to clipboard: ${queryFile}`, kind: "info" })
          } else {
            dispatch({ type: "SHOW_MESSAGE", message: `Pipeline file: ${queryFile}`, kind: "info" })
          }
        })
        .catch(() => {})
      return
    }

    // Filter bar key handling
    if (state.queryVisible) {
      if (key.name === "escape") {
        dispatch({ type: "CLOSE_QUERY" })
        return
      }
      // Tab from simple filter bar: switch to pipeline mode
      if (key.name === "tab") {
        dispatch({ type: "CLOSE_QUERY" })
        dispatch({ type: "ENTER_PIPELINE_MODE" })
        return
      }
      return
    }

    // Don't handle keys when command palette is open
    if (state.commandPaletteVisible) return

    // Pipeline→simple confirmation dialog
    if (state.pipelineConfirm) {
      const confirm = state.pipelineConfirm
      const pipelineOpts = [
        { key: "n", exec: () => {
          stopWatching()
          dispatch({ type: "STOP_PIPELINE_WATCH" })
          dispatch({ type: "CONFIRM_NEW_TAB_SIMPLE", query: confirm.simpleQuery })
          dispatch({ type: "CLONE_TAB" })
          dispatch({ type: "CLEAR_PIPELINE" })
          dispatch({ type: "OPEN_QUERY" })
        }},
        { key: "o", exec: () => {
          stopWatching()
          dispatch({ type: "STOP_PIPELINE_WATCH" })
          dispatch({ type: "CONFIRM_OVERWRITE_SIMPLE", query: confirm.simpleQuery })
        }},
        { key: "escape", exec: () => dispatch({ type: "DISMISS_PIPELINE_CONFIRM" }) },
      ]
      if (key.name === "escape") {
        dispatch({ type: "DISMISS_PIPELINE_CONFIRM" })
      } else if (key.name === "h" || key.name === "left") {
        dispatch({ type: "MOVE_PIPELINE_CONFIRM_FOCUS", delta: -1 })
      } else if (key.name === "l" || key.name === "right") {
        dispatch({ type: "MOVE_PIPELINE_CONFIRM_FOCUS", delta: 1 })
      } else if (key.name === "return") {
        if (confirm.focusedIndex >= 0) pipelineOpts[confirm.focusedIndex]?.exec()
      } else {
        // Letter keys navigate to matching option
        const match = pipelineOpts.findIndex((o) => o.key === key.name)
        if (match !== -1) dispatch({ type: "MOVE_PIPELINE_CONFIRM_FOCUS", delta: match - confirm.focusedIndex })
      }
      return
    }

    // Bulk edit confirmation dialog
    if (state.bulkEditConfirmation) {
      const { resolve, goBack, missing, added, focusedIndex } = state.bulkEditConfirmation
      const opts: Array<{ key: string; exec: () => void }> = [
        { key: "b", exec: () => { dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" }); goBack() } },
        { key: "i", exec: () => { dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" }); resolve("ignore", "ignore") } },
      ]
      if (missing.length > 0)
        opts.push({ key: "d", exec: () => { dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" }); resolve("delete", "ignore") } })
      if (added.length > 0)
        opts.push({ key: "a", exec: () => { dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" }); resolve("ignore", "insert") } })
      if (missing.length > 0 && added.length > 0)
        opts.push({ key: "x", exec: () => { dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" }); resolve("delete", "insert") } })
      opts.push({ key: "c", exec: () => { dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" }) } })

      if (key.name === "return") {
        // Enter only confirms if the user has explicitly selected an option
        if (focusedIndex >= 0) opts[focusedIndex]?.exec()
      }
      else if (key.name === "h" || key.name === "left") { dispatch({ type: "MOVE_BULK_EDIT_FOCUS", delta: -1 }) }
      else if (key.name === "l" || key.name === "right") { dispatch({ type: "MOVE_BULK_EDIT_FOCUS", delta: 1 }) }
      else {
        // Letter keys only move focus — Enter is required to confirm
        const match = opts.findIndex((o) => o.key === key.name)
        if (match !== -1) dispatch({ type: "SET_BULK_EDIT_FOCUS", index: match })
      }
      return
    }

    // Delete confirmation dialog
    if (state.deleteConfirmation) {
      const { resolve, focusedIndex } = state.deleteConfirmation
      const opts = [
        { key: "c", exec: () => { dispatch({ type: "CLEAR_DELETE_CONFIRM" }); resolve(false) } },
        { key: "d", exec: () => { dispatch({ type: "CLEAR_DELETE_CONFIRM" }); resolve(true) } },
      ]
      if (key.name === "return") {
        // Enter only confirms if the user has explicitly selected an option
        if (focusedIndex >= 0) opts[focusedIndex]?.exec()
      }
      else if (key.name === "escape") {
        dispatch({ type: "CLEAR_DELETE_CONFIRM" }); resolve(false)
      }
      else if (key.name === "h" || key.name === "left") { dispatch({ type: "MOVE_DELETE_FOCUS", delta: -1 }) }
      else if (key.name === "l" || key.name === "right") { dispatch({ type: "MOVE_DELETE_FOCUS", delta: 1 }) }
      else {
        // Letter keys only move focus — Enter is required to confirm
        const match = opts.findIndex((o) => o.key === key.name)
        if (match !== -1) dispatch({ type: "SET_DELETE_FOCUS", index: match })
      }
      return
    }

    // Escape exits selection mode
    if (key.name === "escape" && state.selectionMode !== "none") {
      dispatch({ type: "EXIT_SELECTION_MODE" })
      return
    }

    // Ctrl+A selects all
    if (key.ctrl && key.name === "a" && state.view === "documents") {
      dispatch({ type: "SELECT_ALL" })
      return
    }

    // Quit
    if (key.name === "q") {
      stopWatching()
      disconnect().catch(() => {})
      renderer.destroy()
      process.exit(0)
    }

    // Tab from pipeline mode → back to simple
    if (key.name === "tab" && state.view === "documents" && state.pipelineMode && !state.queryVisible) {
      const { filter, projection } = extractFindParts(state.pipeline)
      const { query, lossless } = filterToSimple(filter as Record<string, unknown>)
      const hasComplexStages = classifyPipeline(state.pipeline)
      // Carry $project stage back as pipe projection suffix
      const projSuffix = buildProjSuffix(projection)
      const simpleQueryWithProj = query + projSuffix
      if (lossless && !hasComplexStages) {
        stopWatching()
        dispatch({ type: "STOP_PIPELINE_WATCH" })
        dispatch({ type: "ENTER_SIMPLE_MODE", query: simpleQueryWithProj })
        dispatch({ type: "OPEN_QUERY" })
      } else {
        dispatch({ type: "SHOW_PIPELINE_CONFIRM", simpleQuery: simpleQueryWithProj })
      }
      return
    }

    // Backspace clears filter or pipeline
    if (key.name === "backspace" && state.view === "documents") {
      if (state.pipelineMode) {
        stopWatching()
        dispatch({ type: "STOP_PIPELINE_WATCH" })
        dispatch({ type: "CLEAR_PIPELINE" })
        return
      }
      if (state.queryInput) {
        dispatch({ type: "CLEAR_QUERY" })
        return
      }
    }

    // Tab management (available in document view)
    if (state.view === "documents") {
      // t: clone current tab
      if (key.name === "t") {
        dispatch({ type: "CLONE_TAB" })
        return
      }
      // d: close current tab
      if (key.name === "d" && !key.ctrl && !key.shift) {
        if (state.activeTabId) {
          dispatch({ type: "CLOSE_TAB", tabId: state.activeTabId })
        }
        return
      }
      // u: undo close tab (not Ctrl+U which scrolls preview)
      if (key.name === "u" && !key.ctrl) {
        dispatch({ type: "UNDO_CLOSE_TAB" })
        return
      }
      // 1-9: switch to tab by number
      if (key.sequence && /^[1-9]$/.test(key.sequence)) {
        const tabIndex = parseInt(key.sequence) - 1
        if (tabIndex < state.tabs.length) {
          stopWatching()
          dispatch({ type: "STOP_PIPELINE_WATCH" })
          dispatch({ type: "SWITCH_TAB", tabId: state.tabs[tabIndex].id })
        }
        return
      }
      // [/]: previous/next tab
      if (key.name === "[" || (key.sequence === "[")) {
        const currentIndex = state.tabs.findIndex((t) => t.id === state.activeTabId)
        if (currentIndex > 0) {
          stopWatching()
          dispatch({ type: "STOP_PIPELINE_WATCH" })
          dispatch({ type: "SWITCH_TAB", tabId: state.tabs[currentIndex - 1].id })
        }
        return
      }
      if (key.name === "]" || (key.sequence === "]")) {
        const currentIndex = state.tabs.findIndex((t) => t.id === state.activeTabId)
        if (currentIndex < state.tabs.length - 1) {
          stopWatching()
          dispatch({ type: "STOP_PIPELINE_WATCH" })
          dispatch({ type: "SWITCH_TAB", tabId: state.tabs[currentIndex + 1].id })
        }
        return
      }
    }

    // Document view
    if (state.view === "documents") {
      // Shift+F: toggle filter/pipeline bar visibility
      if (key.name === "f" && key.shift) {
        dispatch({ type: "TOGGLE_FILTER_BAR" })
        return
      }

      switch (key.name) {
        case "j":
        case "down": {
          if (state.selectionMode === "selecting") dispatch({ type: "MOVE_SELECTION", delta: 1 })
          else dispatch({ type: "MOVE_DOCUMENT", delta: 1 })
          // Trigger next-page load when within 10 rows of the loaded end
          const LOAD_THRESHOLD = 10
          if (
            !state.loadingMore &&
            state.loadedCount < state.documentCount &&
            state.selectedIndex >= state.documents.length - LOAD_THRESHOLD
          ) {
            dispatch({ type: "LOAD_MORE" })
          }
          break
        }
        case "k":
        case "up":
          if (state.selectionMode === "selecting") dispatch({ type: "MOVE_SELECTION", delta: -1 })
          else dispatch({ type: "MOVE_DOCUMENT", delta: -1 })
          break
        case "h":
        case "left":
          dispatch({ type: "MOVE_COLUMN", delta: -1 })
          break
        case "l":
        case "right":
          dispatch({ type: "MOVE_COLUMN", delta: 1 })
          break
        case "w":
          dispatch({ type: "CYCLE_COLUMN_MODE" })
          break
        case "-": {
          // Toggle exclusion of current column via projection
          const visCols = state.columns.filter((c) => c.visible)
          const col = visCols[state.selectedColumnIndex]
          if (!col) break

          if (state.pipelineMode) {
            // Pipeline mode: add/update $project stage in the live pipeline
            const existingProjIdx = state.pipeline.findIndex((s) => "$project" in s)
            const existingProj: Record<string, 0 | 1> = existingProjIdx !== -1
              ? { ...(state.pipeline[existingProjIdx] as any).$project }
              : {}

            if (existingProj[col.field] === 0) {
              // Already excluded — remove to reveal
              delete existingProj[col.field]
              dispatch({ type: "SHOW_MESSAGE", message: `Showing ${col.field}`, kind: "info" })
            } else {
              // Exclude this column
              existingProj[col.field] = 0
              dispatch({ type: "SHOW_MESSAGE", message: `Hiding ${col.field}`, kind: "info" })
            }

            let newPipeline: import("mongodb").Document[]
            if (Object.keys(existingProj).length === 0) {
              // Empty $project — remove the stage entirely
              newPipeline = state.pipeline.filter((_, i) => i !== existingProjIdx)
            } else if (existingProjIdx !== -1) {
              newPipeline = state.pipeline.map((s, i) =>
                i === existingProjIdx ? { $project: existingProj } : s
              )
            } else {
              newPipeline = [...state.pipeline, { $project: existingProj }]
            }

            const newSource = JSON.stringify({ pipeline: newPipeline }, null, 2)
            dispatch({
              type: "SET_PIPELINE",
              pipeline: newPipeline,
              source: newSource,
              isAggregate: classifyPipeline(newPipeline),
            })
          } else if (state.queryMode !== "bson") {
            // Simple mode: toggle -field projection token in the query string
            const { projection: projObj2 } = parseSimpleQueryFull(state.queryInput)
            const proj: Record<string, 0 | 1> = { ...(projObj2 ?? {}) }
            if (proj[col.field] === 0) {
              delete proj[col.field]
              dispatch({ type: "SHOW_MESSAGE", message: `Showing ${col.field}`, kind: "info" })
            } else {
              delete proj[col.field]  // remove +field if present
              proj[col.field] = 0
              dispatch({ type: "SHOW_MESSAGE", message: `Hiding ${col.field}`, kind: "info" })
            }
            // Rebuild: keep all non-projection tokens, append new projection tokens
            const nonProjTokens = state.queryInput.trim().split(/\s+/).filter((t: string) => {
              if (!t) return false
              if (t.startsWith("+")) return false
              if (t.startsWith("-") && !/[><!:]/.test(t.slice(1))) return false
              return true
            })
            const projStr = Object.keys(proj).length > 0 ? " " + projectionToSimple(proj) : ""
            dispatch({ type: "SET_QUERY_INPUT", input: (nonProjTokens.join(" ") + projStr).trim() })
            dispatch({ type: "SUBMIT_QUERY" })
          }
          break
        }
        case "v":
          if (state.selectionMode === "none" || state.selectionMode === "selected") {
            dispatch({ type: "ENTER_SELECTION_MODE" })
          } else {
            dispatch({ type: "FREEZE_SELECTION" })
          }
          break
        case "space":
          dispatch({ type: "TOGGLE_CURRENT_ROW" })
          break
        case "o":
          dispatch({ type: "JUMP_SELECTION_END" })
          break
        case "s": {
          const visCols = state.columns.filter((c) => c.visible)
          const sortCol = visCols[state.selectedColumnIndex]
          if (sortCol) {
            dispatch({ type: "CYCLE_SORT", field: sortCol.field })
          }
          break
        }
        case "y": {
          const doc = state.documents[state.selectedIndex]
          if (!doc) break

          if (key.shift) {
            // Y: yank full document
            const json = serializeDocument(doc)
            const b64 = btoa(json)
            process.stdout.write(`\x1b]52;c;${b64}\x07`)
            dispatch({ type: "SHOW_MESSAGE", message: "Document copied to clipboard", kind: "info" })
          } else {
            // y: yank current cell value
            const visCols = state.columns.filter((c) => c.visible)
            const col = visCols[state.selectedColumnIndex]
            if (!col) break
            const val = getNestedValue(doc as Record<string, unknown>, col.field)
            const text = val === undefined ? ""
              : typeof val === "object" && val !== null ? JSON.stringify(val, null, 2)
              : String(val)
            const b64 = btoa(text)
            process.stdout.write(`\x1b]52;c;${b64}\x07`)
            dispatch({ type: "SHOW_MESSAGE", message: `Copied ${col.field} to clipboard`, kind: "info" })
          }
          break
        }
        case "r":
          dispatch({ type: "RELOAD_DOCUMENTS" })
          break
        case "f": {
          // Shift+f is handled above as pipeline bar toggle — skip here
          if (key.shift) break
          // Filter from current cell value — works in both simple and pipeline mode
          const doc = state.documents[state.selectedIndex]
          const visibleCols = state.columns.filter((c) => c.visible)
          const col = visibleCols[state.selectedColumnIndex]
          if (!doc || !col) break

          // Treat absent fields (undefined) the same as null — both produce field:null
          const val = getNestedValue(doc as Record<string, unknown>, col.field) ?? null

          if (state.pipelineMode) {
            // Pipeline mode: try to add to $match
            const matchStage = state.pipeline.find((s) => "$match" in s) as any
            if (!matchStage) {
              dispatch({ type: "SHOW_MESSAGE", message: "Cannot add filter: pipeline has no $match stage", kind: "warning" })
              break
            }
            // Skip if this field is already in $match
            if (col.field in (matchStage.$match ?? {})) {
              dispatch({ type: "SHOW_MESSAGE", message: `${col.field} is already in $match — edit pipeline with Ctrl+F to change it`, kind: "warning" })
              break
            }
            // Check for complex value types that can't be merged simply
            const isSimpleValue = val === null
              || typeof val === "string"
              || typeof val === "number"
              || typeof val === "boolean"
            if (!isSimpleValue) {
              dispatch({ type: "SHOW_MESSAGE", message: `Cannot filter by ${col.field}: complex value — edit pipeline with Ctrl+F`, kind: "warning" })
              break
            }
            dispatch({ type: "ADD_PIPELINE_MATCH_CONDITION", field: col.field, value: val })
          } else {
            // Simple mode: append field:value token, skip if already filtering on this field
            const alreadyFiltered = state.queryInput
              .split(" ")
              .some((t) => t.startsWith(`${col.field}:`) || t.startsWith(`${col.field}>`) || t.startsWith(`${col.field}<`) || t.startsWith(`${col.field}!`))
            if (alreadyFiltered) {
              dispatch({ type: "SHOW_MESSAGE", message: `${col.field} is already in filter — use / to edit`, kind: "warning" })
              break
            }
            let formatted: string
            if (val instanceof ObjectId) {
              formatted = `ObjectId(${val.toHexString()})`
            } else if (typeof val === "string") {
              formatted = val.includes(" ") ? `"${val}"` : val
            } else {
              formatted = String(val)
            }
            const token = `${col.field}:${formatted}`
            const newQuery = state.queryInput
              ? `${state.queryInput} ${token}`
              : token
            dispatch({ type: "SET_QUERY_INPUT", input: newQuery })
            dispatch({ type: "SUBMIT_QUERY" })
          }
          break
        }
        case "e": {
          const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
          if (!activeTab) break
          // Edit selected rows if cursor is on a selected row, otherwise edit current doc only
          const cursorOnSelection = state.selectedRows.has(state.selectedIndex)
          const docsToEdit = cursorOnSelection
            ? state.documents.filter((_, i) => state.selectedRows.has(i))
            : [state.documents[state.selectedIndex]].filter(Boolean)
          if (docsToEdit.length === 0) break

          renderer.suspend()
          openEditorForMany(activeTab.collectionName, state.dbName, docsToEdit, undefined, state.schemaMap)
            .then(async (outcome) => {
              renderer.resume()
              if (outcome.cancelled) return
              const { result, applyEdits, editedDocs } = outcome
              if (result.errors.length > 0) { dispatch({ type: "SHOW_MESSAGE", message: result.errors[0], kind: "error" }); return }
              await applyEdits()
              const hasSideEffects = result.missing.length > 0 || result.added.length > 0
              if (!hasSideEffects) {
                const n = result.updated
                dispatch({ type: "SHOW_MESSAGE", message: n > 0 ? `Updated ${n} document${n === 1 ? "" : "s"}` : "No changes", kind: n > 0 ? "success" : "info" })
                dispatch({ type: "FREEZE_SELECTION" })
                dispatch({ type: "RELOAD_DOCUMENTS" })
                return
              }
              const showConfirm = (cr: typeof result, ce: typeof editedDocs) => dispatch({
                type: "SHOW_BULK_EDIT_CONFIRM",
                confirmation: {
                  missing: cr.missing, added: cr.added, focusedIndex: -1,
                  goBack: () => {
                    renderer.suspend()
                    openEditorForMany(activeTab.collectionName, state.dbName, docsToEdit, ce, state.schemaMap)
                      .then(async (o2) => {
                        renderer.resume()
                        if (o2.cancelled) return
                        await o2.applyEdits()
                        if (o2.result.missing.length === 0 && o2.result.added.length === 0) {
                          const n2 = o2.result.updated
                          dispatch({ type: "SHOW_MESSAGE", message: n2 > 0 ? `Updated ${n2} document${n2 === 1 ? "" : "s"}` : "No changes", kind: n2 > 0 ? "success" : "info" })
                          dispatch({ type: "FREEZE_SELECTION" })
                          dispatch({ type: "RELOAD_DOCUMENTS" })
                        } else { showConfirm(o2.result, o2.editedDocs) }
                      })
                      .catch((err: Error) => { renderer.resume(); dispatch({ type: "SHOW_MESSAGE", message: `Edit failed: ${err.message}`, kind: "error" }) })
                  },
                  resolve: async (missingAction, addedAction) => {
                    const errors = await applyConfirmActions(activeTab.collectionName, cr, missingAction, addedAction)
                    if (errors.length > 0) { dispatch({ type: "SHOW_MESSAGE", message: errors[0], kind: "error" }) }
                    else {
                      const parts: string[] = []
                      if (cr.updated > 0) parts.push(`${cr.updated} updated`)
                      if (missingAction === "delete" && cr.missing.length > 0) parts.push(`${cr.missing.length} deleted`)
                      if (addedAction === "insert" && cr.added.length > 0) parts.push(`${cr.added.length} inserted`)
                      dispatch({ type: "SHOW_MESSAGE", message: parts.join(", ") || "Done", kind: "success" })
                    }
                    dispatch({ type: "FREEZE_SELECTION" })
                    dispatch({ type: "RELOAD_DOCUMENTS" })
                  },
                },
              })
              showConfirm(result, editedDocs)
            })
            .catch((err: Error) => { renderer.resume(); dispatch({ type: "SHOW_MESSAGE", message: `Edit failed: ${err.message}`, kind: "error" }) })
          break
        }
        case "i": {
          const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
          if (!activeTab) break
          const templateDoc = state.documents[state.selectedIndex]
          renderer.suspend()
          openEditorForInsert(activeTab.collectionName, state.dbName, templateDoc, state.schemaMap)
            .then((outcome) => {
              renderer.resume()
              if (outcome.cancelled) return
              if (outcome.errors.length > 0) { dispatch({ type: "SHOW_MESSAGE", message: outcome.errors[0], kind: "error" }) }
              else if (outcome.inserted > 0) {
                dispatch({ type: "SHOW_MESSAGE", message: `Inserted ${outcome.inserted} document${outcome.inserted === 1 ? "" : "s"}`, kind: "success" })
                dispatch({ type: "RELOAD_DOCUMENTS" })
              } else { dispatch({ type: "SHOW_MESSAGE", message: "No documents inserted", kind: "info" }) }
            })
            .catch((err: Error) => { renderer.resume(); dispatch({ type: "SHOW_MESSAGE", message: `Insert failed: ${err.message}`, kind: "error" }) })
          break
        }
        case "d":
          if (key.shift) {
            const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
            if (!activeTab) break
            const docsToDelete = state.selectedRows.size > 0
              ? state.documents.filter((_, i) => state.selectedRows.has(i))
              : [state.documents[state.selectedIndex]].filter(Boolean)
            if (docsToDelete.length === 0) break
            dispatch({
              type: "SHOW_DELETE_CONFIRM",
              confirmation: {
                docs: docsToDelete, focusedIndex: -1,
                resolve: async (confirmed) => {
                  if (!confirmed) return
                  const errors: string[] = []
                  for (const doc of docsToDelete) {
                    try { await deleteDocument(activeTab.collectionName, doc._id) }
                    catch (err) { errors.push(`Delete failed: ${(err as Error).message}`) }
                  }
                  if (errors.length > 0) { dispatch({ type: "SHOW_MESSAGE", message: errors[0], kind: "error" }) }
                  else {
                    const n = docsToDelete.length
                    dispatch({ type: "SHOW_MESSAGE", message: `Deleted ${n} document${n === 1 ? "" : "s"}`, kind: "success" })
                    dispatch({ type: "EXIT_SELECTION_MODE" })
                  }
                  dispatch({ type: "RELOAD_DOCUMENTS" })
                },
              },
            })
          } else if (key.ctrl && state.previewPosition) {
            dispatch({ type: "SCROLL_PREVIEW", delta: 10 })
          }
          break
        case "u":
          if (key.ctrl && state.previewPosition) {
            dispatch({ type: "SCROLL_PREVIEW", delta: -10 })
          }
          break
        case "p":
          if (key.shift) {
            dispatch({ type: "CYCLE_PREVIEW_POSITION" })
          } else {
            dispatch({ type: "TOGGLE_PREVIEW" })
          }
          break
        case "/":
          if (state.pipelineMode) {
            // In pipeline mode, / switches to simple (same as Tab)
            const { filter, projection } = extractFindParts(state.pipeline)
            const { query, lossless } = filterToSimple(filter as Record<string, unknown>)
            const hasComplexStages = classifyPipeline(state.pipeline)
            const projSuffix2 = buildProjSuffix(projection)
            const simpleQueryWithProj2 = query + projSuffix2
            if (lossless && !hasComplexStages) {
              stopWatching()
              dispatch({ type: "STOP_PIPELINE_WATCH" })
              dispatch({ type: "ENTER_SIMPLE_MODE", query: simpleQueryWithProj2 })
              if (!state.filterBarVisible) dispatch({ type: "TOGGLE_FILTER_BAR" })
              dispatch({ type: "OPEN_QUERY" })
            } else {
              if (!state.filterBarVisible) dispatch({ type: "TOGGLE_FILTER_BAR" })
              dispatch({ type: "SHOW_PIPELINE_CONFIRM", simpleQuery: simpleQueryWithProj2 })
            }
          } else {
            if (!state.filterBarVisible) dispatch({ type: "TOGGLE_FILTER_BAR" })
            dispatch({ type: "OPEN_QUERY" })
          }
          break
      }
    }
  })
}
