/**
 * Hook: global keyboard navigation.
 * Thin root that delegates to focused sub-hooks by domain:
 *   - useDialogKeys     — confirmation dialogs
 *   - usePipelineKeys   — pipeline editor, Ctrl+F/E, Tab mode switch
 *   - useDocumentEditKeys — e/i/D edit, insert, delete
 * Document navigation (j/k/h/l/etc.) is handled here.
 */

import type { Dispatch, RefObject } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { ObjectId } from "mongodb"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { disconnect } from "../providers/mongodb"
import { serializeDocument } from "../utils/document"
import { getNestedValue } from "../utils/format"
import { projectionToSimple, parseSimpleQueryFull } from "../query/parser"
import { classifyPipeline, stageOf } from "../query/pipeline"
import { stopWatching } from "../actions/pipelineWatch"
import { useDialogKeys } from "./useDialogKeys"
import { usePipelineKeys } from "./usePipelineKeys"
import { useDocumentEditKeys } from "./useDocumentEditKeys"

interface UseKeyboardNavOptions {
  state: AppState
  dispatch: Dispatch<AppAction>
  docListScrollRef: RefObject<ScrollBoxRenderable>
}

export function useKeyboardNav({ state, dispatch, docListScrollRef }: UseKeyboardNavOptions) {
  const renderer = useRenderer()
  const {
    handleKey: handleDialogKey,
    pipelineFocusedIndex,
    bulkEditFocusedIndex,
    deleteFocusedIndex,
  } = useDialogKeys({ state, dispatch })
  const { handleKey: handlePipelineKey } = usePipelineKeys({ state, dispatch, renderer })
  const { handleKey: handleEditKey } = useDocumentEditKeys({ state, dispatch, renderer })

  useKeyboard((key) => {
    // Ctrl+P: open command palette (only when a collection is open)
    if (key.ctrl && key.name === "p" && state.activeTabId) {
      dispatch({ type: "OPEN_COMMAND_PALETTE" })
      return
    }

    // Ctrl+D/U: half-page scroll — preview if open, else document list
    if ((key.ctrl && key.name === "d") || (key.ctrl && key.name === "u")) {
      if (state.view !== "documents") return
      const dir = key.name === "d" ? 1 : -1
      if (state.previewPosition) {
        dispatch({ type: "SCROLL_PREVIEW", delta: dir * 10 })
        return
      }
      const scrollbox = docListScrollRef.current
      if (!scrollbox) return
      const viewportHeight = scrollbox.viewport?.height ?? 20
      const half = Math.floor(viewportHeight / 2)
      const newIndex = Math.max(
        0,
        Math.min(state.documents.length - 1, state.selectedIndex + dir * half),
      )
      const newScrollTop = Math.max(0, scrollbox.scrollTop + dir * half)
      dispatch({ type: "SELECT_DOCUMENT", index: newIndex })
      scrollbox.scrollTo(newScrollTop)
      if (
        dir === 1 &&
        !state.loadingMore &&
        state.loadedCount < state.documentCount &&
        newIndex >= state.documents.length - 10
      ) {
        dispatch({ type: "LOAD_MORE" })
      }
      return
    }

    // Pipeline keys (Ctrl+F, Ctrl+E, Tab, /)
    if (handlePipelineKey(key)) return

    // Filter bar intercept
    if (state.queryVisible) {
      if (key.name === "escape") {
        dispatch({ type: "CLOSE_QUERY" })
        return
      }
      if (key.name === "tab") {
        dispatch({ type: "CLOSE_QUERY" })
        dispatch({ type: "ENTER_PIPELINE_MODE" })
        return
      }
      return
    }

    // Don't handle keys when command palette is open
    if (state.commandPaletteVisible) return

    // Dialog keys (pipeline confirm, bulk edit confirm, delete confirm)
    if (handleDialogKey(key)) return

    // Escape exits selection mode
    if (key.name === "escape" && state.selectionMode !== "none") {
      dispatch({ type: "EXIT_SELECTION_MODE" })
      return
    }

    // Ctrl+A: select all
    if (key.ctrl && key.name === "a" && state.view === "documents") {
      dispatch({ type: "SELECT_ALL" })
      return
    }

    // q: quit
    if (key.name === "q") {
      stopWatching()
      disconnect().catch(() => {})
      renderer.destroy()
      process.exit(0)
      return
    }

    // Backspace: clear filter or pipeline
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

    if (state.view !== "documents") return

    // Tab management
    if (key.name === "t") {
      dispatch({ type: "CLONE_TAB" })
      return
    }
    if (key.name === "d" && !key.ctrl && !key.shift) {
      if (state.tabs.length <= 1) {
        dispatch({ type: "SHOW_MESSAGE", message: "Cannot close the last tab", kind: "warning" })
      } else if (state.activeTabId) {
        dispatch({ type: "CLOSE_TAB", tabId: state.activeTabId })
      }
      return
    }
    if (key.name === "u" && !key.ctrl) {
      dispatch({ type: "UNDO_CLOSE_TAB" })
      return
    }
    if (key.sequence && /^[1-9]$/.test(key.sequence)) {
      const tabIndex = parseInt(key.sequence) - 1
      if (tabIndex < state.tabs.length) {
        stopWatching()
        dispatch({ type: "STOP_PIPELINE_WATCH" })
        dispatch({ type: "SWITCH_TAB", tabId: state.tabs[tabIndex].id })
      }
      return
    }
    if (key.name === "[" || key.sequence === "[") {
      const idx = state.tabs.findIndex((t) => t.id === state.activeTabId)
      if (idx > 0) {
        stopWatching()
        dispatch({ type: "STOP_PIPELINE_WATCH" })
        dispatch({ type: "SWITCH_TAB", tabId: state.tabs[idx - 1].id })
      }
      return
    }
    if (key.name === "]" || key.sequence === "]") {
      const idx = state.tabs.findIndex((t) => t.id === state.activeTabId)
      if (idx < state.tabs.length - 1) {
        stopWatching()
        dispatch({ type: "STOP_PIPELINE_WATCH" })
        dispatch({ type: "SWITCH_TAB", tabId: state.tabs[idx + 1].id })
      }
      return
    }

    // Shift+F: toggle filter bar
    if (key.name === "f" && key.shift) {
      dispatch({ type: "TOGGLE_FILTER_BAR" })
      return
    }

    // Edit/insert/delete keys
    if (handleEditKey(key)) return

    // Document navigation
    switch (key.name) {
      case "j":
      case "down": {
        if (state.selectionMode === "selecting") dispatch({ type: "MOVE_SELECTION", delta: 1 })
        else dispatch({ type: "MOVE_DOCUMENT", delta: 1 })
        if (
          !state.loadingMore &&
          state.loadedCount < state.documentCount &&
          state.selectedIndex >= state.documents.length - 10
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
      case "r":
        dispatch({ type: "RELOAD_DOCUMENTS" })
        break
      case "p":
        if (key.shift) {
          dispatch({ type: "CYCLE_PREVIEW_POSITION" })
        } else {
          dispatch({ type: "TOGGLE_PREVIEW" })
        }
        break
      case "s": {
        const visCols = state.columns.filter((c) => c.visible)
        const sortCol = visCols[state.selectedColumnIndex]
        if (sortCol) dispatch({ type: "CYCLE_SORT", field: sortCol.field })
        break
      }
      case "y": {
        const doc = state.documents[state.selectedIndex]
        if (!doc) break
        if (key.shift) {
          const b64 = btoa(serializeDocument(doc))
          process.stdout.write(`\x1b]52;c;${b64}\x07`)
          dispatch({ type: "SHOW_MESSAGE", message: "Document copied to clipboard", kind: "info" })
        } else {
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
          dispatch({
            type: "SHOW_MESSAGE",
            message: `Copied ${col.field} to clipboard`,
            kind: "info",
          })
        }
        break
      }
      case "f": {
        if (key.shift) break
        const doc = state.documents[state.selectedIndex]
        const visCols = state.columns.filter((c) => c.visible)
        const col = visCols[state.selectedColumnIndex]
        if (!doc || !col) break
        const val = getNestedValue(doc as Record<string, unknown>, col.field) ?? null
        if (state.pipelineMode) {
          const matchStageDoc = state.pipeline.find((s) => "$match" in s)
          if (!matchStageDoc) {
            dispatch({
              type: "SHOW_MESSAGE",
              message: "Cannot add filter: pipeline has no $match stage",
              kind: "warning",
            })
            break
          }
          const matchStage = stageOf(matchStageDoc)
          if (col.field in (matchStage.$match ?? {})) {
            dispatch({
              type: "SHOW_MESSAGE",
              message: `${col.field} is already in $match — edit pipeline with Ctrl+F to change it`,
              kind: "warning",
            })
            break
          }
          const isSimpleValue =
            val === null ||
            typeof val === "string" ||
            typeof val === "number" ||
            typeof val === "boolean"
          if (!isSimpleValue) {
            dispatch({
              type: "SHOW_MESSAGE",
              message: `Cannot filter by ${col.field}: complex value — edit pipeline with Ctrl+F`,
              kind: "warning",
            })
            break
          }
          dispatch({ type: "ADD_PIPELINE_MATCH_CONDITION", field: col.field, value: val })
        } else {
          const alreadyFiltered = state.queryInput
            .split(" ")
            .some(
              (t) =>
                t.startsWith(`${col.field}:`) ||
                t.startsWith(`${col.field}>`) ||
                t.startsWith(`${col.field}<`) ||
                t.startsWith(`${col.field}!`),
            )
          if (alreadyFiltered) {
            dispatch({
              type: "SHOW_MESSAGE",
              message: `${col.field} is already in filter — use / to edit`,
              kind: "warning",
            })
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
          const existingTokens = state.queryInput.trim().split(/\s+/).filter(Boolean)
          const filterTokens = existingTokens.filter(
            (t: string) => !t.startsWith("+") && !(t.startsWith("-") && !/[><!:]/.test(t.slice(1))),
          )
          const projTokens = existingTokens.filter(
            (t: string) => t.startsWith("+") || (t.startsWith("-") && !/[><!:]/.test(t.slice(1))),
          )
          dispatch({
            type: "SET_QUERY_INPUT",
            input: [...filterTokens, token, ...projTokens].join(" "),
          })
          dispatch({ type: "SUBMIT_QUERY" })
        }
        break
      }
      case "-": {
        const visCols = state.columns.filter((c) => c.visible)
        const col = visCols[state.selectedColumnIndex]
        if (!col) break
        if (state.pipelineMode) {
          const existingProjIdx = state.pipeline.findIndex((s) => "$project" in s)
          const existingProj: Record<string, 0 | 1> =
            existingProjIdx !== -1
              ? { ...(stageOf(state.pipeline[existingProjIdx]).$project as Record<string, 0 | 1>) }
              : {}
          if (existingProj[col.field] === 0) {
            delete existingProj[col.field]
            dispatch({ type: "SHOW_MESSAGE", message: `Showing ${col.field}`, kind: "info" })
          } else {
            existingProj[col.field] = 0
            dispatch({ type: "SHOW_MESSAGE", message: `Hiding ${col.field}`, kind: "info" })
          }
          let newPipeline: import("mongodb").Document[]
          if (Object.keys(existingProj).length === 0) {
            newPipeline = state.pipeline.filter((_, i) => i !== existingProjIdx)
          } else if (existingProjIdx !== -1) {
            newPipeline = state.pipeline.map((s, i) =>
              i === existingProjIdx ? { $project: existingProj } : s,
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
          const { projection: projObj } = parseSimpleQueryFull(state.queryInput)
          const proj: Record<string, 0 | 1> = { ...(projObj ?? {}) }
          if (proj[col.field] === 0) {
            delete proj[col.field]
            dispatch({ type: "SHOW_MESSAGE", message: `Showing ${col.field}`, kind: "info" })
          } else {
            delete proj[col.field]
            proj[col.field] = 0
            dispatch({ type: "SHOW_MESSAGE", message: `Hiding ${col.field}`, kind: "info" })
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
        }
        break
      }
    }
  })

  return { pipelineFocusedIndex, bulkEditFocusedIndex, deleteFocusedIndex }
}
