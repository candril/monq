/** Reducer: pipeline mode, stages, confirm dialogs, watcher */

import type { AppState } from "../../types"
import type { AppAction } from "../../state"
import { parseSimpleQueryFull } from "../../query/parser"
import { stageOf } from "../../query/pipeline"

export function pipelineReducer(state: AppState, action: AppAction): AppState | null {
  switch (action.type) {
    case "SET_PIPELINE":
      return {
        ...state,
        pipelineMode: true,
        pipeline: action.pipeline,
        pipelineSource: action.source,
        pipelineIsAggregate: action.isAggregate,
        pipelineConfirm: null,
        queryInput: "",
        documentsLoading: true,
        reloadCounter: state.reloadCounter + 1,
        selectedIndex: 0,
        documents: [],
        loadedCount: 0,
        loadingMore: false,
      }

    case "CLEAR_PIPELINE":
      return {
        ...state,
        pipelineMode: false,
        pipeline: [],
        pipelineSource: "",
        pipelineIsAggregate: false,
        pipelineConfirm: null,
        pipelineWatching: false,
        queryMode: "simple",
        queryInput: "",
        documentsLoading: true,
        reloadCounter: state.reloadCounter + 1,
        selectedIndex: 0,
        documents: [],
        loadedCount: 0,
        loadingMore: false,
      }

    case "ENTER_PIPELINE_MODE": {
      const stages: import("mongodb").Document[] = []
      const { filter: enterFilter, projection: enterProj } = parseSimpleQueryFull(
        state.queryInput,
        state.schemaMap,
      )
      try {
        stages.push({ $match: enterFilter })
      } catch {
        /* skip */
      }
      if (state.sortField) {
        stages.push({ $sort: { [state.sortField]: state.sortDirection } })
      }
      if (enterProj) {
        stages.push({ $project: enterProj })
      }
      return {
        ...state,
        pipelineMode: true,
        pipeline: stages,
        pipelineSource: "",
        pipelineIsAggregate: false,
        pipelineConfirm: null,
        queryVisible: false,
      }
    }

    case "ENTER_SIMPLE_MODE":
      return {
        ...state,
        pipelineMode: false,
        pipeline: [],
        pipelineSource: "",
        pipelineIsAggregate: false,
        pipelineConfirm: null,
        queryInput: action.query,
        queryVisible: false,
        documentsLoading: true,
        reloadCounter: state.reloadCounter + 1,
        selectedIndex: 0,
      }

    case "SHOW_PIPELINE_CONFIRM":
      return { ...state, pipelineConfirm: { simpleQuery: action.simpleQuery } }

    case "DISMISS_PIPELINE_CONFIRM":
      return { ...state, pipelineConfirm: null }

    case "CONFIRM_OVERWRITE_SIMPLE":
      return {
        ...state,
        pipelineMode: false,
        pipeline: [],
        pipelineSource: "",
        pipelineIsAggregate: false,
        pipelineConfirm: null,
        queryInput: action.query,
        queryVisible: true,
        documentsLoading: true,
        reloadCounter: state.reloadCounter + 1,
        selectedIndex: 0,
      }

    case "CONFIRM_NEW_TAB_SIMPLE":
      return { ...state, pipelineConfirm: null }

    case "ADD_PIPELINE_MATCH_CONDITION": {
      const matchIdx = state.pipeline.findIndex((s) => "$match" in s)
      if (matchIdx === -1) {
        return state
      }

      const updatedPipeline = state.pipeline.map((stage, i) => {
        if (i !== matchIdx) {
          return stage
        }
        const existingMatch = stageOf(stage).$match ?? {}
        return { $match: { ...existingMatch, [action.field]: action.value } }
      })

      const newSource = JSON.stringify({ pipeline: updatedPipeline }, null, 2)

      return {
        ...state,
        pipeline: updatedPipeline,
        pipelineSource: newSource,
        documentsLoading: true,
        reloadCounter: state.reloadCounter + 1,
        selectedIndex: 0,
      }
    }

    case "START_PIPELINE_WATCH":
      return { ...state, pipelineWatching: true }

    case "STOP_PIPELINE_WATCH":
      return { ...state, pipelineWatching: false }

    default:
      return null
  }
}
