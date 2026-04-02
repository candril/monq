/** Reducer: row selection (enter, exit, freeze, toggle, move, select-all) */

import type { Document } from "mongodb"
import type { AppState, SelectionMode } from "../../types"
import type { AppAction } from "../../state"

type MaybeObjectId = { toHexString?: () => string }

function idKey(id: unknown): string {
  const maybeId = id as MaybeObjectId
  return id != null && typeof maybeId.toHexString === "function"
    ? maybeId.toHexString()
    : String(id)
}

function deriveSelectedRows(documents: Document[], selectedIds: Set<string>): Set<number> {
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

export function selectionReducer(state: AppState, action: AppAction): AppState | null {
  switch (action.type) {
    case "ENTER_SELECTION_MODE": {
      if (state.selectionMode === "selecting") {
        return state
      }
      const anchor = state.selectedIndex
      const doc = state.documents[anchor]
      const frozenIds = new Set(state.selectedIds)
      const selectedIds = new Set(frozenIds)
      if (doc?._id !== undefined) {
        selectedIds.add(idKey(doc._id))
      }
      const selectedRows = deriveSelectedRows(state.documents, selectedIds)
      return {
        ...state,
        selectionMode: "selecting",
        selectionAnchor: anchor,
        frozenIds,
        selectedIds,
        selectedRows,
      }
    }

    case "EXIT_SELECTION_MODE":
      return {
        ...state,
        selectionMode: "none",
        selectedIds: new Set(),
        frozenIds: new Set(),
        selectedRows: new Set(),
        selectionAnchor: null,
      }

    case "FREEZE_SELECTION":
      if (state.selectionMode !== "selecting") {
        return state
      }
      return {
        ...state,
        selectionMode: "selected",
        frozenIds: new Set(state.selectedIds),
        selectionAnchor: null,
      }

    case "TOGGLE_CURRENT_ROW": {
      const doc = state.documents[state.selectedIndex]
      if (!doc || doc._id === undefined) {
        return state
      }
      const key = idKey(doc._id)
      const selectedIds = new Set(state.selectedIds)
      const frozenIds = new Set(state.frozenIds)
      if (selectedIds.has(key)) {
        selectedIds.delete(key)
        frozenIds.delete(key)
      } else {
        selectedIds.add(key)
        frozenIds.add(key)
      }
      const selectedRows = deriveSelectedRows(state.documents, selectedIds)
      const selectionMode: SelectionMode =
        state.selectionMode === "none" ? "selected" : state.selectionMode
      return { ...state, selectionMode, selectedIds, frozenIds, selectedRows }
    }

    case "MOVE_SELECTION": {
      const newIndex = Math.max(
        0,
        Math.min(state.documents.length - 1, state.selectedIndex + action.delta),
      )
      if (state.selectionMode === "selecting") {
        const anchor = state.selectionAnchor ?? newIndex
        const selectedIds = new Set(state.frozenIds)
        const lo = Math.min(anchor, newIndex)
        const hi = Math.max(anchor, newIndex)
        for (let i = lo; i <= hi; i++) {
          const id = state.documents[i]?._id
          if (id !== undefined) {
            selectedIds.add(idKey(id))
          }
        }
        const selectedRows = deriveSelectedRows(state.documents, selectedIds)
        return { ...state, selectedIndex: newIndex, selectedIds, selectedRows }
      }
      return { ...state, selectedIndex: newIndex }
    }

    case "JUMP_SELECTION_END": {
      if (state.selectionMode !== "selecting" || state.selectionAnchor === null) {
        return state
      }
      return {
        ...state,
        selectedIndex: state.selectionAnchor,
        selectionAnchor: state.selectedIndex,
      }
    }

    case "SELECT_ALL": {
      const selectedIds = new Set(state.selectedIds)
      for (const doc of state.documents) {
        if (doc._id !== undefined) {
          selectedIds.add(idKey(doc._id))
        }
      }
      const frozenIds = new Set(selectedIds)
      const selectedRows = deriveSelectedRows(state.documents, selectedIds)
      return {
        ...state,
        selectionMode: "selecting",
        frozenIds,
        selectedIds,
        selectedRows,
        selectionAnchor: state.selectedIndex,
      }
    }

    default:
      return null
  }
}
