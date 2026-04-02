/** Reducer: document list, columns, sort, schema */

import type { AppState } from "../../types"
import type { AppAction } from "../../state"
import { stageOf } from "../../query/pipeline"

export function documentsReducer(state: AppState, action: AppAction): AppState | null {
  switch (action.type) {
    case "SET_DOCUMENTS": {
      const selectedRows = deriveSelectedRows(action.documents, state.selectedIds)
      return {
        ...state,
        documents: action.documents,
        documentCount: action.count,
        totalDocumentCount: action.totalCount ?? state.totalDocumentCount,
        documentsLoading: false,
        loadedCount: action.documents.length,
        loadingMore: false,
        selectedIndex: Math.min(state.selectedIndex, Math.max(0, action.documents.length - 1)),
        selectedRows,
      }
    }

    case "APPEND_DOCUMENTS":
      return {
        ...state,
        documents: [...state.documents, ...action.documents],
        loadedCount: state.loadedCount + action.documents.length,
        loadingMore: false,
      }

    case "LOAD_MORE":
      if (state.loadingMore || state.loadedCount >= state.documentCount) {
        return state
      }
      return { ...state, loadingMore: true }

    case "SET_DOCUMENTS_LOADING":
      return { ...state, documentsLoading: action.loading }

    case "RELOAD_DOCUMENTS":
      return {
        ...state,
        documentsLoading: true,
        reloadCounter: state.reloadCounter + 1,
        loadedCount: 0,
        loadingMore: false,
      }

    case "SELECT_DOCUMENT":
      return { ...state, selectedIndex: Math.max(0, action.index) }

    case "MOVE_DOCUMENT": {
      const newIndex = Math.max(
        0,
        Math.min(state.documents.length - 1, state.selectedIndex + action.delta),
      )
      return { ...state, selectedIndex: newIndex }
    }

    case "SET_COLUMNS": {
      const visibleCount = action.columns.filter((c) => c.visible).length
      const clampedIndex = Math.min(state.selectedColumnIndex, Math.max(0, visibleCount - 1))
      return { ...state, columns: action.columns, selectedColumnIndex: clampedIndex }
    }

    case "SET_SCHEMA":
      return { ...state, schemaMap: action.schemaMap }

    case "CYCLE_SORT": {
      const pipelineSortStage = state.pipelineMode
        ? state.pipeline.find((s) => "$sort" in s)
        : undefined
      const pipelineSortEntries = pipelineSortStage
        ? Object.entries(stageOf(pipelineSortStage).$sort ?? {})
        : []
      const currentField = state.pipelineMode
        ? pipelineSortEntries.length === 1 && pipelineSortEntries[0][0] === action.field
          ? action.field
          : null
        : state.sortField
      const currentDir = state.pipelineMode
        ? pipelineSortEntries.length === 1 && pipelineSortEntries[0][0] === action.field
          ? (pipelineSortEntries[0][1] as 1 | -1)
          : -1
        : state.sortDirection

      let sortField: string | null
      let sortDirection: 1 | -1
      if (currentField !== action.field) {
        sortField = action.field
        sortDirection = 1
      } else if (currentDir === 1) {
        sortField = action.field
        sortDirection = -1
      } else {
        sortField = null
        sortDirection = -1
      }

      if (state.pipelineMode) {
        const sortStageIdx = state.pipeline.findIndex((s) => "$sort" in s)
        let newPipeline: import("mongodb").Document[]
        if (sortField === null) {
          newPipeline =
            sortStageIdx !== -1
              ? state.pipeline.filter((_, i) => i !== sortStageIdx)
              : state.pipeline
        } else {
          const newSortStage = { $sort: { [sortField]: sortDirection } }
          if (sortStageIdx !== -1) {
            newPipeline = state.pipeline.map((s, i) => (i === sortStageIdx ? newSortStage : s))
          } else {
            const matchIdx = state.pipeline.findIndex((s) => "$match" in s)
            newPipeline = [...state.pipeline]
            newPipeline.splice(matchIdx !== -1 ? matchIdx + 1 : 0, 0, newSortStage)
          }
        }
        const newSource = JSON.stringify({ pipeline: newPipeline }, null, 2)
        return {
          ...state,
          pipeline: newPipeline,
          pipelineSource: newSource,
          documentsLoading: true,
          reloadCounter: state.reloadCounter + 1,
          selectedIndex: 0,
        }
      }

      return {
        ...state,
        sortField,
        sortDirection,
        documentsLoading: true,
        reloadCounter: state.reloadCounter + 1,
        selectedIndex: 0,
      }
    }

    case "MOVE_COLUMN": {
      const visibleCols = state.columns.filter((c) => c.visible)
      const newColIndex = Math.max(
        0,
        Math.min(visibleCols.length - 1, state.selectedColumnIndex + action.delta),
      )
      return { ...state, selectedColumnIndex: newColIndex }
    }

    case "CYCLE_COLUMN_MODE": {
      const visibleCols = state.columns.filter((c) => c.visible)
      const targetCol = visibleCols[state.selectedColumnIndex]
      if (!targetCol) {
        return state
      }

      const nextMode = { normal: "full", full: "minimized", minimized: "normal" } as const
      const columns = state.columns.map((c) =>
        c.field === targetCol.field ? { ...c, displayMode: nextMode[c.displayMode] } : c,
      )
      return { ...state, columns }
    }

    default:
      return null
  }
}

// ── Selection helpers (shared with tabs) ─────────────────────────────────────

type MaybeObjectId = { toHexString?: () => string }

function idKey(id: unknown): string {
  const maybeId = id as MaybeObjectId
  return id != null && typeof maybeId.toHexString === "function"
    ? maybeId.toHexString()
    : String(id)
}

export function deriveSelectedRows(
  documents: import("mongodb").Document[],
  selectedIds: Set<string>,
): Set<number> {
  if (selectedIds.size === 0) {
    return new Set()
  }
  const rows = new Set<number>()
  for (let i = 0; i < documents.length; i++) {
    if (selectedIds.has(idKey(documents[i]._id))) {
      rows.add(i)
    }
  }
  return rows
}
