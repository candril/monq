/**
 * Column picker UI state. A reducer rather than separate useStates: keys can
 * arrive in one input chunk (a paste, a fast `j` + Space) before React
 * re-renders, and each has to act on the result of the one before.
 */

import { moveChecked, toggleAll, togglePath, type PickerRow } from "../query/columnPicker"
import { fuzzyFilter } from "../utils/fuzzy"

export interface PickerState {
  rows: PickerRow[]
  defaults: string[]
  query: string
  cursor: number
  checked: string[]
  /** Set on Enter; the component hands `checked` back once it sees it. */
  applied: boolean
}

export type PickerAction =
  | { type: "move"; delta: number }
  | { type: "toggle" }
  | { type: "toggle-all" }
  | { type: "reorder"; delta: -1 | 1 }
  | { type: "reset" }
  | { type: "query"; edit: (query: string) => string }
  | { type: "apply" }

export function initPicker(rows: PickerRow[], checked: string[], defaults: string[]): PickerState {
  return { rows, defaults, query: "", cursor: 0, checked, applied: false }
}

export function visibleRows(state: PickerState): PickerRow[] {
  return fuzzyFilter(state.query, state.rows, (row) => [row.path])
}

function cursorPath(state: PickerState): string | undefined {
  const rows = visibleRows(state)
  return rows[Math.min(state.cursor, rows.length - 1)]?.path
}

export function pickerReducer(state: PickerState, action: PickerAction): PickerState {
  switch (action.type) {
    case "move": {
      const last = visibleRows(state).length - 1
      return { ...state, cursor: Math.max(0, Math.min(last, state.cursor + action.delta)) }
    }
    case "toggle": {
      const path = cursorPath(state)
      return path ? { ...state, checked: togglePath(state.checked, path) } : state
    }
    case "toggle-all":
      return {
        ...state,
        checked: toggleAll(
          state.checked,
          visibleRows(state).map((row) => row.path),
        ),
      }
    case "reorder": {
      const path = cursorPath(state)
      return path ? { ...state, checked: moveChecked(state.checked, path, action.delta) } : state
    }
    case "reset":
      return { ...state, checked: state.defaults }
    case "query":
      return { ...state, query: action.edit(state.query), cursor: 0 }
    case "apply":
      return { ...state, applied: true }
  }
}
