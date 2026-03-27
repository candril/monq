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
  | { type: "CLONE_TAB" }
  | { type: "CLOSE_TAB"; tabId: string }
  | { type: "SWITCH_TAB"; tabId: string }
  | { type: "UNDO_CLOSE_TAB" }
  // Documents
  | { type: "SET_DOCUMENTS"; documents: Document[]; count: number; totalCount?: number }
  | { type: "APPEND_DOCUMENTS"; documents: Document[] }
  | { type: "SET_DOCUMENTS_LOADING"; loading: boolean }
  | { type: "RELOAD_DOCUMENTS" }
  | { type: "SELECT_DOCUMENT"; index: number }
  | { type: "MOVE_DOCUMENT"; delta: number }
  | { type: "SET_COLUMNS"; columns: DetectedColumn[] }
  | { type: "MOVE_COLUMN"; delta: number }
  | { type: "CYCLE_COLUMN_MODE" }
  | { type: "SET_SCHEMA"; schemaMap: import("./query/schema").SchemaMap }
  | { type: "CYCLE_SORT"; field: string }
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
    closedTabs: [],
    documents: [],
    documentsLoading: false,
    documentCount: 0,
    totalDocumentCount: 0,
    reloadCounter: 0,
    selectedIndex: 0,
    selectedColumnIndex: 0,
    columns: [],
    schemaMap: new Map(),
    sortField: null,
    sortDirection: -1,
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

/** Snapshot current view state into a Tab object */
function snapshotTab(state: AppState, tabId: string, collectionName: string): Tab {
  return {
    id: tabId,
    collectionName,
    query: state.queryInput,
    queryMode: state.queryMode,
    selectedIndex: state.selectedIndex,
    selectedColumnIndex: state.selectedColumnIndex,
    scrollOffset: 0,
    sortField: state.sortField,
    sortDirection: state.sortDirection,
    columns: state.columns,
    previewPosition: state.previewPosition,
    previewScrollOffset: state.previewScrollOffset,
    documents: state.documents,
    documentCount: state.documentCount,
    totalDocumentCount: state.totalDocumentCount,
  }
}

/** Restore view state from a Tab */
function restoreFromTab(state: AppState, tab: Tab): Partial<AppState> {
  return {
    queryInput: tab.query,
    queryMode: tab.queryMode,
    selectedIndex: tab.selectedIndex,
    selectedColumnIndex: tab.selectedColumnIndex,
    sortField: tab.sortField,
    sortDirection: tab.sortDirection,
    columns: tab.columns,
    previewPosition: tab.previewPosition,
    previewScrollOffset: tab.previewScrollOffset,
    documents: tab.documents,
    documentCount: tab.documentCount,
    totalDocumentCount: tab.totalDocumentCount,
    documentsLoading: false,
  }
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
      // Save current tab state first
      const savedTabs = state.activeTabId
        ? state.tabs.map((t) =>
            t.id === state.activeTabId ? snapshotTab(state, t.id, t.collectionName) : t
          )
        : state.tabs

      const newTab: Tab = {
        id: generateTabId(),
        collectionName: action.collectionName,
        query: "",
        queryMode: "simple",
        selectedIndex: 0,
        selectedColumnIndex: 0,
        scrollOffset: 0,
        sortField: null,
        sortDirection: -1,
        columns: [],
        previewPosition: null,
        previewScrollOffset: 0,
        documents: [],
        documentCount: 0,
        totalDocumentCount: 0,
      }
      return {
        ...state,
        tabs: [...savedTabs, newTab],
        activeTabId: newTab.id,
        view: "documents",
        documents: [],
        documentsLoading: true,
        documentCount: 0,
        totalDocumentCount: 0,
        selectedIndex: 0,
        selectedColumnIndex: 0,
        columns: [],
        sortField: null,
        sortDirection: -1,
        queryInput: "",
        previewPosition: null,
        previewScrollOffset: 0,
      }
    }

    case "CLONE_TAB": {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) return state

      // Save current state to active tab, then clone it
      const savedTabs = state.tabs.map((t) =>
        t.id === state.activeTabId ? snapshotTab(state, t.id, t.collectionName) : t
      )

      const newTab: Tab = {
        ...snapshotTab(state, generateTabId(), activeTab.collectionName),
      }
      return {
        ...state,
        tabs: [...savedTabs, newTab],
        activeTabId: newTab.id,
        // Keep current view state (cloned), trigger reload
        documents: [],
        documentsLoading: true,
        documentCount: 0,
        totalDocumentCount: 0,
        reloadCounter: state.reloadCounter + 1,
      }
    }

    case "CLOSE_TAB": {
      const closingTab = state.tabs.find((t) => t.id === action.tabId)
      if (!closingTab) return state

      // Snapshot the closing tab for undo
      const savedClosing = action.tabId === state.activeTabId
        ? snapshotTab(state, closingTab.id, closingTab.collectionName)
        : closingTab
      const closedTabs = [...state.closedTabs, savedClosing].slice(-10) // Keep last 10

      if (state.tabs.length <= 1) {
        return {
          ...state,
          tabs: [],
          activeTabId: null,
          closedTabs,
          view: "collections",
          documents: [],
          documentCount: 0,
          totalDocumentCount: 0,
          selectedIndex: 0,
          selectedColumnIndex: 0,
          columns: [],
          queryInput: "",
          sortField: null,
          sortDirection: -1,
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

      // Restore target tab's state
      const targetTab = newTabs.find((t) => t.id === newActiveId)
      const restored = targetTab && needNewActive ? restoreFromTab(state, targetTab) : {}

      return {
        ...state,
        ...restored,
        tabs: newTabs,
        activeTabId: newActiveId,
        closedTabs,
        documents: needNewActive ? [] : state.documents,
        documentsLoading: needNewActive,
        documentCount: needNewActive ? 0 : state.documentCount,
        totalDocumentCount: needNewActive ? 0 : state.totalDocumentCount,
        reloadCounter: needNewActive ? state.reloadCounter + 1 : state.reloadCounter,
      }
    }

    case "UNDO_CLOSE_TAB": {
      if (state.closedTabs.length === 0) return state

      const restoredTab = state.closedTabs[state.closedTabs.length - 1]
      const closedTabs = state.closedTabs.slice(0, -1)

      // Save current tab state
      const savedTabs = state.activeTabId
        ? state.tabs.map((t) =>
            t.id === state.activeTabId ? snapshotTab(state, t.id, t.collectionName) : t
          )
        : state.tabs

      return {
        ...state,
        ...restoreFromTab(state, restoredTab),
        tabs: [...savedTabs, restoredTab],
        activeTabId: restoredTab.id,
        closedTabs,
        view: "documents",
      }
    }

    case "SWITCH_TAB": {
      if (action.tabId === state.activeTabId) return state

      // Save current tab state before switching
      const tabs = state.tabs.map((t) =>
        t.id === state.activeTabId ? snapshotTab(state, t.id, t.collectionName) : t
      )

      const targetTab = tabs.find((t) => t.id === action.tabId)
      if (!targetTab) return state

      return {
        ...state,
        ...restoreFromTab(state, targetTab),
        tabs,
        activeTabId: action.tabId,
      }
    }

    // Documents
    case "SET_DOCUMENTS":
      return {
        ...state,
        documents: action.documents,
        documentCount: action.count,
        totalDocumentCount: action.totalCount ?? state.totalDocumentCount,
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

    case "SET_COLUMNS": {
      // Preserve column index if within bounds, reset only if columns changed drastically
      const visibleCount = action.columns.filter((c) => c.visible).length
      const clampedIndex = Math.min(state.selectedColumnIndex, Math.max(0, visibleCount - 1))
      return { ...state, columns: action.columns, selectedColumnIndex: clampedIndex }
    }

    case "SET_SCHEMA":
      return { ...state, schemaMap: action.schemaMap }

    case "CYCLE_SORT": {
      let sortField: string | null
      let sortDirection: 1 | -1
      if (state.sortField !== action.field) {
        // New field: start ascending
        sortField = action.field
        sortDirection = 1
      } else if (state.sortDirection === 1) {
        // Was asc: switch to desc
        sortField = action.field
        sortDirection = -1
      } else {
        // Was desc: clear sort
        sortField = null
        sortDirection = -1
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
    case "OPEN_QUERY": {
      // Append space if query exists (so suggestions show new tokens, not completions)
      const queryWithSpace = state.queryInput && !state.queryInput.endsWith(" ")
        ? state.queryInput + " "
        : state.queryInput
      return { ...state, queryVisible: true, queryInput: queryWithSpace }
    }

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
        reloadCounter: state.reloadCounter + 1,
        selectedIndex: 0,
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
        reloadCounter: state.reloadCounter + 1,
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
