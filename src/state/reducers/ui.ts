/** Reducer: UI chrome (preview, command palette, messages, filter bar, dialogs) */

import type { AppState } from "../../types"
import type { AppAction } from "../../state"

export function uiReducer(state: AppState, action: AppAction): AppState | null {
  switch (action.type) {
    // Preview
    case "TOGGLE_PREVIEW":
      return {
        ...state,
        previewPosition: state.previewPosition ? null : "right",
        previewMode: "document",
        previewScrollOffset: 0,
      }

    case "CYCLE_PREVIEW_POSITION":
      if (!state.previewPosition) return state
      return {
        ...state,
        previewPosition: state.previewPosition === "right" ? "bottom" : "right",
        previewScrollOffset: 0,
      }

    case "SCROLL_PREVIEW":
      return {
        ...state,
        previewScrollOffset: Math.max(0, state.previewScrollOffset + action.delta),
      }

    case "SET_PREVIEW_MODE":
      return { ...state, previewMode: action.mode, previewScrollOffset: 0 }

    case "SET_EXPLAIN_RESULT":
      return { ...state, explainResult: action.result, explainLoading: false }

    case "SET_EXPLAIN_LOADING":
      return { ...state, explainLoading: action.loading }

    // Command palette
    case "OPEN_COMMAND_PALETTE":
      return { ...state, commandPaletteVisible: true }

    case "CLOSE_COMMAND_PALETTE":
      return { ...state, commandPaletteVisible: false }

    // Messages
    case "SHOW_MESSAGE":
      return { ...state, message: { text: action.message, kind: action.kind ?? "info" } }

    case "CLEAR_MESSAGE":
      return { ...state, message: null }

    // Filter bar
    case "TOGGLE_FILTER_BAR":
      return { ...state, filterBarVisible: !state.filterBarVisible }

    // Confirmation dialogs
    case "SHOW_BULK_EDIT_CONFIRM":
      return { ...state, bulkEditConfirmation: action.confirmation }

    case "CLEAR_BULK_EDIT_CONFIRM":
      return { ...state, bulkEditConfirmation: null }

    case "SHOW_DELETE_CONFIRM":
      return { ...state, deleteConfirmation: action.confirmation }

    case "CLEAR_DELETE_CONFIRM":
      return { ...state, deleteConfirmation: null }

    case "SHOW_BULK_QUERY_UPDATE_CONFIRM":
      return { ...state, bulkQueryUpdateConfirmation: action.confirmation }

    case "CLEAR_BULK_QUERY_UPDATE_CONFIRM":
      return { ...state, bulkQueryUpdateConfirmation: null }

    case "SHOW_BULK_QUERY_DELETE_CONFIRM":
      return { ...state, bulkQueryDeleteConfirmation: action.confirmation }

    case "CLEAR_BULK_QUERY_DELETE_CONFIRM":
      return { ...state, bulkQueryDeleteConfirmation: null }

    case "SHOW_DROP_CONFIRM":
      return { ...state, dropConfirmation: action.confirmation }

    case "CLEAR_DROP_CONFIRM":
      return { ...state, dropConfirmation: null }

    case "SHOW_CREATE_INPUT":
      return { ...state, createInput: action.input }

    case "CLEAR_CREATE_INPUT":
      return { ...state, createInput: null }

    case "SHOW_RENAME_INPUT":
      return { ...state, renameInput: action.input }

    case "CLEAR_RENAME_INPUT":
      return { ...state, renameInput: null }

    case "SHOW_INDEX_CREATE_CONFIRM":
      return { ...state, indexCreateConfirmation: action.confirmation }

    case "CLEAR_INDEX_CREATE_CONFIRM":
      return { ...state, indexCreateConfirmation: null }

    default:
      return null
  }
}
