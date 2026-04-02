/** Palette handlers: query and pipeline commands */

import type { PaletteContext } from "./types"
import { openPipelineEditor, writePipelineFile, pipelineFilePaths } from "../pipeline"
import { startWatching, reloadFromFile, openTmuxSplit } from "../pipelineWatch"

export function handleQueryCommand(cmdId: string, ctx: PaletteContext): boolean {
  const { state, dispatch, renderer } = ctx

  switch (cmdId) {
    case "query:open-filter":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      dispatch({ type: "OPEN_QUERY" })
      return true
    case "query:open-filter-bson":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      dispatch({ type: "OPEN_QUERY_BSON" })
      return true
    case "query:clear-filter":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      dispatch({ type: "CLEAR_QUERY" })
      return true
    case "query:format-bson":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      dispatch({ type: "FORMAT_BSON_SECTION" })
      dispatch({ type: "OPEN_QUERY_BSON" })
      return true
    case "query:sort": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const visCols = state.columns.filter((c) => c.visible)
      const sortCol = visCols[state.selectedColumnIndex]
      if (sortCol) {
        dispatch({ type: "CYCLE_SORT", field: sortCol.field })
      }
      return true
    }
    case "query:clear-pipeline":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      dispatch({ type: "CLEAR_PIPELINE" })
      return true
    case "query:open-pipeline": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) {
        return true
      }
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
          if (!result) {
            return
          }
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
    case "query:open-pipeline-tmux": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) {
        return true
      }
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
    default:
      return false
  }
}
