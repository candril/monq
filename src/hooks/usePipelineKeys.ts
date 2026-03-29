/**
 * Hook: keyboard handling for pipeline mode.
 * Covers Ctrl+F (open editor), Ctrl+E (tmux split), Tab (pipeline↔simple), / (open filter).
 * Returns true if the key was consumed.
 */

import type { Dispatch } from "react"
import type { CliRenderer } from "@opentui/core"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import type { Keymap } from "../config/types"
import { matches } from "../utils/keymap"
import { openPipelineEditor, writePipelineFile, pipelineFilePaths } from "../actions/pipeline"
import {
  startWatching,
  stopWatching,
  reloadFromFile,
  openTmuxSplit,
} from "../actions/pipelineWatch"
import { classifyPipeline, extractFindParts } from "../query/pipeline"
import { filterToSimple, projectionToSimple } from "../query/parser"
import type { Document } from "mongodb"

interface UsePipelineKeysOptions {
  state: AppState
  dispatch: Dispatch<AppAction>
  renderer: CliRenderer
  keymap: Keymap
}

/** Build +field/-field projection suffix from a $project object */
function buildProjSuffix(projection: Document | undefined): string {
  if (!projection || typeof projection !== "object") return ""
  const entries = Object.entries(projection as Record<string, unknown>).filter(
    ([, v]) => v === 0 || v === 1,
  ) as [string, 0 | 1][]
  if (entries.length === 0) return ""
  return " " + projectionToSimple(Object.fromEntries(entries) as Record<string, 0 | 1>)
}

function switchToSimple(state: AppState, dispatch: Dispatch<AppAction>, openQuery: boolean) {
  const { filter, projection } = extractFindParts(state.pipeline)
  const { query, lossless } = filterToSimple(filter as Record<string, unknown>)
  const hasComplexStages = classifyPipeline(state.pipeline)
  const simpleQuery = query + buildProjSuffix(projection)

  if (lossless && !hasComplexStages) {
    stopWatching()
    dispatch({ type: "STOP_PIPELINE_WATCH" })
    dispatch({ type: "ENTER_SIMPLE_MODE", query: simpleQuery })
    if (openQuery) {
      if (!state.filterBarVisible) dispatch({ type: "TOGGLE_FILTER_BAR" })
      dispatch({ type: "OPEN_QUERY" })
    }
  } else {
    if (openQuery && !state.filterBarVisible) dispatch({ type: "TOGGLE_FILTER_BAR" })
    dispatch({ type: "SHOW_PIPELINE_CONFIRM", simpleQuery })
  }
}

export function usePipelineKeys({ state, dispatch, renderer, keymap }: UsePipelineKeysOptions) {
  function handleKey(key: {
    name: string
    ctrl?: boolean
    shift?: boolean
    sequence?: string
  }): boolean {
    if (state.view !== "documents" || !state.activeTabId) return false

    // pipeline.open: open pipeline editor (blocking)
    if (matches(key, keymap["pipeline.open"])) {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) return true
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
      return true
    }

    // pipeline.open_full: open pipeline file in tmux split (non-blocking)
    if (matches(key, keymap["pipeline.open_full"])) {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) return true
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
            dispatch({ type: "SHOW_MESSAGE", message: `Pipeline file: ${queryFile}`, kind: "info" })
          }
        })
        .catch(() => {})
      return true
    }

    // query.toggle_mode: pipeline→simple (when in pipeline mode)
    if (matches(key, keymap["query.toggle_mode"]) && state.pipelineMode && !state.queryVisible) {
      switchToSimple(state, dispatch, true)
      return true
    }

    // Ctrl-Y: open history picker while simple query bar is open (not remappable — internal shortcut)
    if (key.ctrl && key.name === "y" && state.queryVisible && state.queryMode === "simple") {
      dispatch({ type: "OPEN_HISTORY_PICKER" })
      return true
    }

    // query.open: open filter (switches to simple first if in pipeline mode)
    if (matches(key, keymap["query.open"])) {
      if (state.pipelineMode) {
        switchToSimple(state, dispatch, true)
      } else {
        if (!state.filterBarVisible) dispatch({ type: "TOGGLE_FILTER_BAR" })
        dispatch({ type: "OPEN_QUERY" })
      }
      return true
    }

    return false
  }

  return { handleKey }
}
