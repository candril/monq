/**
 * Hook: Keyboard navigation
 * Handles global keys — quit, open palette, document navigation.
 * Does NOT handle input when command palette or query bar is open.
 */

import type { Dispatch } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { disconnect, serializeDocument, deleteDocument } from "../providers/mongodb"
import { openPipelineEditor, extractFindParts, classifyPipeline } from "../actions/pipeline"
import { openEditorForMany, openEditorForInsert, applyConfirmActions } from "../actions/editMany"
import { filterToSimple } from "../query/parser"
import { formatValue } from "../utils/format"

interface UseKeyboardNavOptions {
  state: AppState
  dispatch: Dispatch<AppAction>
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

export function useKeyboardNav({ state, dispatch }: UseKeyboardNavOptions) {
  const renderer = useRenderer()

  useKeyboard((key) => {
    // Open command palette (always available)
    if (key.ctrl && key.name === "p") {
      dispatch({ type: "OPEN_COMMAND_PALETTE" })
      return
    }

    // Ctrl+F: open pipeline editor in $EDITOR
    if (key.ctrl && key.name === "f") {
      if (state.view !== "documents" || !state.activeTabId) return
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) return

      // When pipeline is active, pipelineSource is re-opened as-is.
      // When simple filter is active, queryInput migrates into $match.
      // When both empty, fresh template is shown.
      renderer.suspend()
      openPipelineEditor({
        collectionName: activeTab.collectionName,
        dbName: state.dbName,
        pipelineSource: state.pipelineSource,
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
        })
        .catch((err: Error) => {
          dispatch({ type: "SET_ERROR", error: `Pipeline error: ${err.message}` })
        })
        .finally(() => {
          renderer.resume()
        })
      return
    }

    // Filter bar key handling
    if (state.queryVisible) {
      if (key.name === "escape") {
        dispatch({ type: "CLOSE_QUERY" })
        return
      }
      // Tab: simple filter bar → readonly pipeline view
      if (key.name === "tab") {
        dispatch({ type: "CLOSE_QUERY" })
        if (state.pipeline.length > 0) {
          // Real pipeline — show it expanded
          dispatch({ type: "SHOW_PIPELINE_BAR" })
        } else {
          // No pipeline — show simple filter as pipeline preview
          dispatch({ type: "SHOW_SIMPLE_AS_PIPELINE" })
        }
        return
      }
      // Pipeline active — filter bar shouldn't be visible, close it
      if (state.pipeline.length > 0) {
        dispatch({ type: "CLOSE_QUERY" })
        return
      }
      // Enter submits in BSON mode (textarea keybinding fires submit() but
      // the onSubmit wiring is unreliable — handle it here directly instead)
      if ((key.name === "return" || key.name === "enter") && state.queryMode === "bson") {
        dispatch({ type: "SUBMIT_QUERY" })
        return
      }

      // BSON-mode only controls
      if (state.queryMode === "bson") {
        // Ctrl+O: toggle sort section
        if (key.ctrl && key.name === "o") {
          dispatch({ type: "TOGGLE_BSON_SORT" })
          return
        }
        // Ctrl+K: toggle projection section
        if (key.ctrl && key.name === "k") {
          dispatch({ type: "TOGGLE_BSON_PROJECTION" })
          return
        }
        // Cycle focus between sections when more than one is open
        // (Enter submits via textarea's own onSubmit, so we need a separate binding)
        if (key.ctrl && key.name === "n") {
          dispatch({ type: "CYCLE_BSON_SECTION" })
          return
        }
      }
      return
    }

    // Don't handle keys when command palette is open
    if (state.commandPaletteVisible) return

    // Confirmation dialog key handling
    if (state.confirmPending === "pipeline-to-simple") {
      if (key.name === "s") {
        dispatch({ type: "CONFIRM_PIPELINE_TO_SIMPLE" })
      } else if (key.name === "n") {
        // Open in new tab with the translated simple query, keep pipeline in current tab
        const { filter } = extractFindParts(state.pipeline)
        const { query } = filterToSimple(filter as Record<string, unknown>)
        dispatch({ type: "DISMISS_CONFIRM" })
        // Clone tab then set simple query on the new tab
        dispatch({ type: "CLONE_TAB" })
        dispatch({ type: "CLEAR_PIPELINE" })
        dispatch({ type: "SET_QUERY_INPUT", input: query })
        dispatch({ type: "SUBMIT_QUERY" })
      } else if (key.name === "escape") {
        dispatch({ type: "DISMISS_CONFIRM" })
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

      if (key.name === "escape") { dispatch({ type: "CLEAR_BULK_EDIT_CONFIRM" }); goBack() }
      else if (key.name === "return") { opts[focusedIndex]?.exec() }
      else if (key.name === "j" || key.name === "down") { dispatch({ type: "MOVE_BULK_EDIT_FOCUS", delta: 1 }) }
      else if (key.name === "k" || key.name === "up") { dispatch({ type: "MOVE_BULK_EDIT_FOCUS", delta: -1 }) }
      else {
        const match = opts.findIndex((o) => o.key === key.name)
        if (match !== -1) {
          if (focusedIndex === match) { opts[match].exec() }
          else { dispatch({ type: "SET_BULK_EDIT_FOCUS", index: match }) }
        }
      }
      return
    }

    // Delete confirmation dialog
    if (state.deleteConfirmation) {
      const { resolve, focusedIndex } = state.deleteConfirmation
      const opts = [
        { key: "n", exec: () => { dispatch({ type: "CLEAR_DELETE_CONFIRM" }); resolve(false) } },
        { key: "d", exec: () => { dispatch({ type: "CLEAR_DELETE_CONFIRM" }); resolve(true) } },
      ]
      if (key.name === "escape" || key.name === "n") { opts[0].exec() }
      else if (key.name === "return") { opts[focusedIndex]?.exec() }
      else if (key.name === "j" || key.name === "down") { dispatch({ type: "MOVE_DELETE_FOCUS", delta: 1 }) }
      else if (key.name === "k" || key.name === "up") { dispatch({ type: "MOVE_DELETE_FOCUS", delta: -1 }) }
      else if (key.name === "d") {
        if (focusedIndex === 1) opts[1].exec()
        else dispatch({ type: "MOVE_DELETE_FOCUS", delta: 1 })
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
      disconnect().catch(() => {})
      renderer.destroy()
      process.exit(0)
    }

    // Tab: readonly pipeline view → back to simple filter bar
    if (key.name === "tab" && state.view === "documents" && state.pipelineVisible && !state.queryVisible) {
      if (state.previewPipeline.length > 0) {
        // Preview of simple filter — just toggle back, reopen simple bar
        dispatch({ type: "TOGGLE_PIPELINE_BAR" })
        dispatch({ type: "OPEN_QUERY" })
      } else if (state.pipeline.length > 0) {
        // Real pipeline — try lossless translation, otherwise confirm
        const { filter } = extractFindParts(state.pipeline)
        const { query, lossless } = filterToSimple(filter as Record<string, unknown>)
        const hasComplexStages = classifyPipeline(state.pipeline)
        if (lossless && !hasComplexStages) {
          dispatch({ type: "SWITCH_TO_SIMPLE", query })
          dispatch({ type: "OPEN_QUERY" })
        } else {
          dispatch({ type: "SHOW_CONFIRM", pending: "pipeline-to-simple", simpleQuery: query })
        }
      }
      return
    }

    // Backspace clears filter or pipeline when bar is closed
    if (key.name === "backspace" && state.view === "documents") {
      if (state.pipeline.length > 0) {
        dispatch({ type: "CLEAR_PIPELINE" })
        return
      }
      if (state.queryInput) {
        dispatch({ type: "CLEAR_QUERY" })
        return
      }
    }

    // F (Shift+f): toggle pipeline bar
    // - real pipeline active → expand/collapse it
    // - simple filter active, no pipeline → show filter translated as pipeline stages
    // - nothing active → show empty bar with hint
    if (key.name === "f" && key.shift && state.view === "documents") {
      if (state.pipeline.length > 0) {
        // Real pipeline: toggle expand/collapse
        dispatch({ type: "TOGGLE_PIPELINE_BAR" })
      } else if (state.queryInput || state.sortField) {
        // Simple filter and/or sort: toggle preview on/off
        if (state.pipelineVisible) {
          dispatch({ type: "TOGGLE_PIPELINE_BAR" })
        } else {
          dispatch({ type: "SHOW_SIMPLE_AS_PIPELINE" })
        }
      } else {
        // Nothing active: toast
        dispatch({ type: "SHOW_MESSAGE", message: "No filter active — use / for simple filter or Ctrl+F for pipeline editor" })
      }
      return
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
          dispatch({ type: "SWITCH_TAB", tabId: state.tabs[tabIndex].id })
        }
        return
      }
      // [/]: previous/next tab
      if (key.name === "[" || (key.sequence === "[")) {
        const currentIndex = state.tabs.findIndex((t) => t.id === state.activeTabId)
        if (currentIndex > 0) {
          dispatch({ type: "SWITCH_TAB", tabId: state.tabs[currentIndex - 1].id })
        }
        return
      }
      if (key.name === "]" || (key.sequence === "]")) {
        const currentIndex = state.tabs.findIndex((t) => t.id === state.activeTabId)
        if (currentIndex < state.tabs.length - 1) {
          dispatch({ type: "SWITCH_TAB", tabId: state.tabs[currentIndex + 1].id })
        }
        return
      }
    }

    // Document view
    if (state.view === "documents") {
      switch (key.name) {
        case "j":
        case "down":
          if (state.selectionMode === "selecting") dispatch({ type: "MOVE_SELECTION", delta: 1 })
          else dispatch({ type: "MOVE_DOCUMENT", delta: 1 })
          break
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
            dispatch({ type: "SHOW_MESSAGE", message: "Document copied to clipboard" })
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
            dispatch({ type: "SHOW_MESSAGE", message: `Copied ${col.field} to clipboard` })
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

          const val = getNestedValue(doc as Record<string, unknown>, col.field)
          if (val === undefined) break

          if (state.pipeline.length > 0) {
            // Pipeline mode: try to add to $match
            const matchStage = state.pipeline.find((s) => "$match" in s) as any
            if (!matchStage) {
              dispatch({ type: "SHOW_MESSAGE", message: "Cannot add filter: pipeline has no $match stage" })
              break
            }
            // Skip if this field is already in $match
            if (col.field in (matchStage.$match ?? {})) {
              dispatch({ type: "SHOW_MESSAGE", message: `${col.field} is already in $match — edit pipeline with Ctrl+F to change it` })
              break
            }
            // Check for complex value types that can't be merged simply
            const isSimpleValue = val === null
              || typeof val === "string"
              || typeof val === "number"
              || typeof val === "boolean"
            if (!isSimpleValue) {
              dispatch({ type: "SHOW_MESSAGE", message: `Cannot filter by ${col.field}: complex value — edit pipeline with Ctrl+F` })
              break
            }
            dispatch({ type: "ADD_PIPELINE_MATCH_CONDITION", field: col.field, value: val })
          } else {
            // Simple mode: append field:value token, skip if already filtering on this field
            const alreadyFiltered = state.queryInput
              .split(" ")
              .some((t) => t.startsWith(`${col.field}:`) || t.startsWith(`${col.field}>`) || t.startsWith(`${col.field}<`) || t.startsWith(`${col.field}!`))
            if (alreadyFiltered) {
              dispatch({ type: "SHOW_MESSAGE", message: `${col.field} is already in filter — use / to edit` })
              break
            }
            const raw = typeof val === "string" ? val : String(val)
            const formatted = raw.includes(" ") ? `"${raw}"` : raw
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
          const docsToEdit = state.selectedRows.size > 0
            ? state.documents.filter((_, i) => state.selectedRows.has(i))
            : [state.documents[state.selectedIndex]].filter(Boolean)
          if (docsToEdit.length === 0) break

          renderer.suspend()
          openEditorForMany(activeTab.collectionName, docsToEdit, undefined, state.schemaMap)
            .then(async (outcome) => {
              renderer.resume()
              if (outcome.cancelled) return
              const { result, applyEdits, editedDocs } = outcome
              if (result.errors.length > 0) { dispatch({ type: "SHOW_MESSAGE", message: result.errors[0] }); return }
              await applyEdits()
              const hasSideEffects = result.missing.length > 0 || result.added.length > 0
              if (!hasSideEffects) {
                const n = result.updated
                dispatch({ type: "SHOW_MESSAGE", message: n > 0 ? `Updated ${n} document${n === 1 ? "" : "s"}` : "No changes" })
                dispatch({ type: "FREEZE_SELECTION" })
                dispatch({ type: "RELOAD_DOCUMENTS" })
                return
              }
              const showConfirm = (cr: typeof result, ce: typeof editedDocs) => dispatch({
                type: "SHOW_BULK_EDIT_CONFIRM",
                confirmation: {
                  missing: cr.missing, added: cr.added, focusedIndex: 0,
                  goBack: () => {
                    renderer.suspend()
                    openEditorForMany(activeTab.collectionName, docsToEdit, ce, state.schemaMap)
                      .then(async (o2) => {
                        renderer.resume()
                        if (o2.cancelled) return
                        await o2.applyEdits()
                        if (o2.result.missing.length === 0 && o2.result.added.length === 0) {
                          const n2 = o2.result.updated
                          dispatch({ type: "SHOW_MESSAGE", message: n2 > 0 ? `Updated ${n2} document${n2 === 1 ? "" : "s"}` : "No changes" })
                          dispatch({ type: "FREEZE_SELECTION" })
                          dispatch({ type: "RELOAD_DOCUMENTS" })
                        } else { showConfirm(o2.result, o2.editedDocs) }
                      })
                      .catch((err: Error) => { renderer.resume(); dispatch({ type: "SHOW_MESSAGE", message: `Edit failed: ${err.message}` }) })
                  },
                  resolve: async (missingAction, addedAction) => {
                    const errors = await applyConfirmActions(activeTab.collectionName, cr, missingAction, addedAction)
                    if (errors.length > 0) { dispatch({ type: "SHOW_MESSAGE", message: errors[0] }) }
                    else {
                      const parts: string[] = []
                      if (cr.updated > 0) parts.push(`${cr.updated} updated`)
                      if (missingAction === "delete" && cr.missing.length > 0) parts.push(`${cr.missing.length} deleted`)
                      if (addedAction === "insert" && cr.added.length > 0) parts.push(`${cr.added.length} inserted`)
                      dispatch({ type: "SHOW_MESSAGE", message: parts.join(", ") || "Done" })
                    }
                    dispatch({ type: "FREEZE_SELECTION" })
                    dispatch({ type: "RELOAD_DOCUMENTS" })
                  },
                },
              })
              showConfirm(result, editedDocs)
            })
            .catch((err: Error) => { renderer.resume(); dispatch({ type: "SHOW_MESSAGE", message: `Edit failed: ${err.message}` }) })
          break
        }
        case "i": {
          const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
          if (!activeTab) break
          const templateDoc = state.documents[state.selectedIndex]
          renderer.suspend()
          openEditorForInsert(activeTab.collectionName, templateDoc, state.schemaMap)
            .then((outcome) => {
              renderer.resume()
              if (outcome.cancelled) return
              if (outcome.errors.length > 0) { dispatch({ type: "SHOW_MESSAGE", message: outcome.errors[0] }) }
              else if (outcome.inserted > 0) {
                dispatch({ type: "SHOW_MESSAGE", message: `Inserted ${outcome.inserted} document${outcome.inserted === 1 ? "" : "s"}` })
                dispatch({ type: "RELOAD_DOCUMENTS" })
              } else { dispatch({ type: "SHOW_MESSAGE", message: "No documents inserted" }) }
            })
            .catch((err: Error) => { renderer.resume(); dispatch({ type: "SHOW_MESSAGE", message: `Insert failed: ${err.message}` }) })
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
                docs: docsToDelete, focusedIndex: 0,
                resolve: async (confirmed) => {
                  if (!confirmed) return
                  const errors: string[] = []
                  for (const doc of docsToDelete) {
                    try { await deleteDocument(activeTab.collectionName, doc._id) }
                    catch (err) { errors.push(`Delete failed: ${(err as Error).message}`) }
                  }
                  if (errors.length > 0) { dispatch({ type: "SHOW_MESSAGE", message: errors[0] }) }
                  else {
                    const n = docsToDelete.length
                    dispatch({ type: "SHOW_MESSAGE", message: `Deleted ${n} document${n === 1 ? "" : "s"}` })
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
          if (state.pipeline.length > 0) {
            // Try to translate pipeline $match back to simple query
            const { filter } = extractFindParts(state.pipeline)
            const { query, lossless } = filterToSimple(filter as Record<string, unknown>)
            const hasComplexStages = classifyPipeline(state.pipeline)

            if (lossless && !hasComplexStages) {
              // Fully lossless: switch directly, pre-populate simple filter
              dispatch({ type: "SWITCH_TO_SIMPLE", query })
            } else {
              // Lossy or has complex stages: ask user what to do
              dispatch({ type: "SHOW_CONFIRM", pending: "pipeline-to-simple", simpleQuery: query })
            }
          } else {
            dispatch({ type: "OPEN_QUERY" })
          }
          break
      }
    }
  })
}
