/**
 * Application state management
 */

import type { Document } from "mongodb"
import type {
  AppState,
  CollectionInfo,
  DetectedColumn,
  PreviewPosition,
  QueryMode,
  Tab,
  View,
} from "./types"

// ============================================================================
// Actions
// ============================================================================

export type AppAction =
  // Connection
  | { type: "SET_CONNECTION_INFO"; dbName: string; host: string }
  | { type: "SET_ERROR"; error: string | null }
  // Collections
  | { type: "SET_COLLECTIONS"; collections: CollectionInfo[] }
  | { type: "SET_COLLECTIONS_LOADING"; loading: boolean }
  | { type: "SELECT_COLLECTION"; index: number }
  | { type: "MOVE_COLLECTION"; delta: number }
  // View
  | { type: "SET_VIEW"; view: View }
  // Tabs
  | { type: "OPEN_TAB"; collectionName: string }
  | { type: "CLOSE_TAB"; tabId: string }
  | { type: "SWITCH_TAB"; tabId: string }
  // Documents
  | { type: "SET_DOCUMENTS"; documents: Document[]; count: number }
  | { type: "APPEND_DOCUMENTS"; documents: Document[] }
  | { type: "SET_DOCUMENTS_LOADING"; loading: boolean }
  | { type: "RELOAD_DOCUMENTS" }
  | { type: "SELECT_DOCUMENT"; index: number }
  | { type: "MOVE_DOCUMENT"; delta: number }
  | { type: "SET_COLUMNS"; columns: DetectedColumn[] }
  | { type: "MOVE_COLUMN"; delta: number }
  | { type: "CYCLE_COLUMN_MODE" }
  // Query
  | { type: "OPEN_QUERY" }
  | { type: "CLOSE_QUERY" }
  | { type: "SET_QUERY_INPUT"; input: string }
  | { type: "SET_QUERY_MODE"; mode: QueryMode }
  | { type: "TOGGLE_QUERY_MODE" }
  | { type: "SUBMIT_QUERY" }
  | { type: "CLEAR_QUERY" }
  // Preview
  | { type: "TOGGLE_PREVIEW" }
  | { type: "CYCLE_PREVIEW_POSITION" }
  | { type: "SCROLL_PREVIEW"; delta: number }
  // Command palette
  | { type: "OPEN_COMMAND_PALETTE" }
  | { type: "CLOSE_COMMAND_PALETTE" }
  // Messages
  | { type: "SHOW_MESSAGE"; message: string }
  | { type: "CLEAR_MESSAGE" }

// ============================================================================
// Initial State
// ============================================================================

export function createInitialState(): AppState {
  return {
    view: "collections",
    dbName: "",
    host: "",
    collections: [],
    collectionsLoading: true,
    collectionSelectedIndex: 0,
    tabs: [],
    activeTabId: null,
    documents: [],
    documentsLoading: false,
    documentCount: 0,
    reloadCounter: 0,
    selectedIndex: 0,
    selectedColumnIndex: 0,
    columns: [],
    queryVisible: false,
    queryMode: "simple",
    queryInput: "",
    previewPosition: null,
    previewScrollOffset: 0,
    commandPaletteVisible: false,
    message: null,
    error: null,
  }
}

// ============================================================================
// Helpers
// ============================================================================

let tabIdCounter = 0
function generateTabId(): string {
  return `tab-${++tabIdCounter}-${Date.now()}`
}

// ============================================================================
// Reducer
// ============================================================================

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    // Connection
    case "SET_CONNECTION_INFO":
      return { ...state, dbName: action.dbName, host: action.host }

    case "SET_ERROR":
      return { ...state, error: action.error, collectionsLoading: false, documentsLoading: false }

    // Collections
    case "SET_COLLECTIONS":
      return {
        ...state,
        collections: action.collections,
        collectionsLoading: false,
      }

    case "SET_COLLECTIONS_LOADING":
      return { ...state, collectionsLoading: action.loading }

    case "SELECT_COLLECTION":
      return { ...state, collectionSelectedIndex: action.index }

    case "MOVE_COLLECTION": {
      const newIndex = Math.max(
        0,
        Math.min(state.collections.length - 1, state.collectionSelectedIndex + action.delta)
      )
      return { ...state, collectionSelectedIndex: newIndex }
    }

    // View
    case "SET_VIEW":
      return { ...state, view: action.view }

    // Tabs
    case "OPEN_TAB": {
      // Check if tab for this collection already exists
      const existing = state.tabs.find((t) => t.collectionName === action.collectionName)
      if (existing) {
        return { ...state, activeTabId: existing.id, view: "documents" }
      }

      const newTab: Tab = {
        id: generateTabId(),
        collectionName: action.collectionName,
        query: "",
        queryMode: "simple",
        selectedIndex: 0,
        scrollOffset: 0,
      }
      return {
        ...state,
        tabs: [...state.tabs, newTab],
        activeTabId: newTab.id,
        view: "documents",
        // Reset document state for new tab
        documents: [],
        documentsLoading: true,
        documentCount: 0,
        selectedIndex: 0,
        columns: [],
        queryInput: "",
        previewScrollOffset: 0,
      }
    }

    case "CLOSE_TAB": {
      if (state.tabs.length <= 1) {
        // Closing last tab → go back to collection browser
        return {
          ...state,
          tabs: [],
          activeTabId: null,
          view: "collections",
          documents: [],
          documentCount: 0,
          selectedIndex: 0,
          columns: [],
          queryInput: "",
        }
      }

      const closingIndex = state.tabs.findIndex((t) => t.id === action.tabId)
      const newTabs = state.tabs.filter((t) => t.id !== action.tabId)
      const needNewActive = state.activeTabId === action.tabId

      let newActiveId = state.activeTabId
      if (needNewActive) {
        const newIndex = Math.min(closingIndex, newTabs.length - 1)
        newActiveId = newTabs[newIndex].id
      }

      return {
        ...state,
        tabs: newTabs,
        activeTabId: newActiveId,
        // Will trigger document reload via effect
        documents: [],
        documentsLoading: true,
        documentCount: 0,
        selectedIndex: 0,
      }
    }

    case "SWITCH_TAB": {
      if (action.tabId === state.activeTabId) return state

      // Save current tab state before switching
      const tabs = state.tabs.map((t) =>
        t.id === state.activeTabId
          ? { ...t, selectedIndex: state.selectedIndex, query: state.queryInput }
          : t
      )

      const targetTab = tabs.find((t) => t.id === action.tabId)
      if (!targetTab) return state

      return {
        ...state,
        tabs,
        activeTabId: action.tabId,
        queryInput: targetTab.query,
        queryMode: targetTab.queryMode,
        selectedIndex: targetTab.selectedIndex,
        // Will trigger document reload via effect
        documents: [],
        documentsLoading: true,
        documentCount: 0,
      }
    }

    // Documents
    case "SET_DOCUMENTS":
      return {
        ...state,
        documents: action.documents,
        documentCount: action.count,
        documentsLoading: false,
        selectedIndex: Math.min(state.selectedIndex, Math.max(0, action.documents.length - 1)),
      }

    case "APPEND_DOCUMENTS":
      return {
        ...state,
        documents: [...state.documents, ...action.documents],
        documentsLoading: false,
      }

    case "SET_DOCUMENTS_LOADING":
      return { ...state, documentsLoading: action.loading }

    case "RELOAD_DOCUMENTS":
      return { ...state, documentsLoading: true, reloadCounter: state.reloadCounter + 1 }

    case "SELECT_DOCUMENT":
      return { ...state, selectedIndex: Math.max(0, action.index) }

    case "MOVE_DOCUMENT": {
      const newIndex = Math.max(
        0,
        Math.min(state.documents.length - 1, state.selectedIndex + action.delta)
      )
      return { ...state, selectedIndex: newIndex }
    }

    case "SET_COLUMNS":
      return { ...state, columns: action.columns, selectedColumnIndex: 0 }

    case "MOVE_COLUMN": {
      const visibleCols = state.columns.filter((c) => c.visible)
      const newColIndex = Math.max(
        0,
        Math.min(visibleCols.length - 1, state.selectedColumnIndex + action.delta)
      )
      return { ...state, selectedColumnIndex: newColIndex }
    }

    case "CYCLE_COLUMN_MODE": {
      const visibleCols = state.columns.filter((c) => c.visible)
      const targetCol = visibleCols[state.selectedColumnIndex]
      if (!targetCol) return state

      const nextMode = { normal: "full", full: "minimized", minimized: "normal" } as const
      const columns = state.columns.map((c) =>
        c.field === targetCol.field
          ? { ...c, displayMode: nextMode[c.displayMode] }
          : c
      )
      return { ...state, columns }
    }

    // Query
    case "OPEN_QUERY":
      return { ...state, queryVisible: true }

    case "CLOSE_QUERY":
      return { ...state, queryVisible: false }

    case "SET_QUERY_INPUT":
      return { ...state, queryInput: action.input }

    case "SET_QUERY_MODE":
      return { ...state, queryMode: action.mode }

    case "TOGGLE_QUERY_MODE":
      return {
        ...state,
        queryMode: state.queryMode === "simple" ? "bson" : "simple",
      }

    case "SUBMIT_QUERY":
      return {
        ...state,
        queryVisible: false,
        documentsLoading: true,
        selectedIndex: 0,
        // Update active tab's query
        tabs: state.tabs.map((t) =>
          t.id === state.activeTabId
            ? { ...t, query: state.queryInput, queryMode: state.queryMode }
            : t
        ),
      }

    case "CLEAR_QUERY":
      return {
        ...state,
        queryInput: "",
        queryVisible: false,
        documentsLoading: true,
        selectedIndex: 0,
        tabs: state.tabs.map((t) =>
          t.id === state.activeTabId ? { ...t, query: "" } : t
        ),
      }

    // Preview
    case "TOGGLE_PREVIEW":
      return {
        ...state,
        previewPosition: state.previewPosition ? null : "right",
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

    // Command palette
    case "OPEN_COMMAND_PALETTE":
      return { ...state, commandPaletteVisible: true }

    case "CLOSE_COMMAND_PALETTE":
      return { ...state, commandPaletteVisible: false }

    // Messages
    case "SHOW_MESSAGE":
      return { ...state, message: action.message }

    case "CLEAR_MESSAGE":
      return { ...state, message: null }

    default:
      return state
  }
}
