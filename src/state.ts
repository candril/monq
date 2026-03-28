/**
 * Application state management
 */

import type { Document } from "mongodb"
import type {
  AppState,
  BsonSection,
  CollectionInfo,
  DetectedColumn,
  PreviewPosition,
  QueryMode,
  Tab,
  View,
} from "./types"
import { parseSimpleQuery } from "./query/parser"

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
  | { type: "OPEN_QUERY_BSON" }
  | { type: "CLOSE_QUERY" }
  | { type: "SET_QUERY_INPUT"; input: string }
  | { type: "SET_QUERY_MODE"; mode: QueryMode }
  | { type: "TOGGLE_QUERY_MODE" }
  | { type: "SET_BSON_SORT"; input: string }
  | { type: "SET_BSON_PROJECTION"; input: string }
  | { type: "SET_BSON_SECTION"; section: BsonSection }
  | { type: "CYCLE_BSON_SECTION" }
  | { type: "TOGGLE_BSON_SORT" }
  | { type: "TOGGLE_BSON_PROJECTION" }
  | { type: "FORMAT_BSON_SECTION" }
  | { type: "SUBMIT_QUERY" }
  | { type: "CLEAR_QUERY" }
  // Pipeline
  | { type: "SET_PIPELINE"; pipeline: import("mongodb").Document[]; source: string; isAggregate: boolean }
  | { type: "CLEAR_PIPELINE" }
  | { type: "TOGGLE_PIPELINE_BAR" }
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
    bsonSort: "",
    bsonProjection: "",
    bsonFocusedSection: "filter",
    bsonSortVisible: false,
    bsonProjectionVisible: false,
    bsonExternalVersion: 0,
    pipeline: [],
    pipelineSource: "",
    pipelineVisible: false,
    pipelineIsAggregate: false,
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
    bsonSort: state.bsonSort,
    bsonProjection: state.bsonProjection,
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
    bsonSort: tab.bsonSort,
    bsonProjection: tab.bsonProjection,
    bsonFocusedSection: "filter",
    bsonSortVisible: tab.bsonSort !== "",
    bsonProjectionVisible: tab.bsonProjection !== "",
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
        bsonSort: "",
        bsonProjection: "",
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
      // In simple mode: append space so suggestions show new tokens, not completions.
      // In BSON mode: just show the bar as-is.
      const queryWithSpace = state.queryMode === "simple" && state.queryInput && !state.queryInput.endsWith(" ")
        ? state.queryInput + " "
        : state.queryInput
      return { ...state, queryVisible: true, queryInput: queryWithSpace }
    }

    case "OPEN_QUERY_BSON": {
      // Open the query bar in BSON mode directly.
      // If currently in simple mode, migrate filter + sort first (same as TOGGLE_QUERY_MODE simple→bson).
      // If already in BSON mode, just ensure it's visible.
      if (state.queryMode === "bson") {
        return { ...state, queryVisible: true }
      }
      let bsonFilter = ""
      try {
        const filter = parseSimpleQuery(state.queryInput, state.schemaMap)
        bsonFilter = Object.keys(filter).length > 0
          ? JSON.stringify(filter, null, 2)
          : "{\n  \n}"
      } catch {
        bsonFilter = "{\n  \n}"
      }
      const bsonSort = state.sortField
        ? JSON.stringify({ [state.sortField]: state.sortDirection }, null, 2)
        : state.bsonSort
      return {
        ...state,
        queryVisible: true,
        queryMode: "bson",
        queryInput: bsonFilter,
        bsonSort,
        bsonSortVisible: bsonSort !== "",
        bsonFocusedSection: "filter",
        sortField: null,
        sortDirection: -1,
        bsonExternalVersion: state.bsonExternalVersion + 1,
      }
    }

    case "CLOSE_QUERY":
      return { ...state, queryVisible: false }

    case "SET_QUERY_INPUT":
      return { ...state, queryInput: action.input }

    case "SET_QUERY_MODE":
      return { ...state, queryMode: action.mode }

    case "TOGGLE_QUERY_MODE": {
      if (state.queryMode === "simple") {
        // simple → bson: migrate current filter + sort into BSON textareas
        let bsonFilter = ""
        try {
          const filter = parseSimpleQuery(state.queryInput, state.schemaMap)
          bsonFilter = Object.keys(filter).length > 0
            ? JSON.stringify(filter, null, 2)
            : "{\n  \n}"
        } catch {
          bsonFilter = "{\n  \n}"
        }
        // Migrate active sort into sort textarea
        const bsonSort = state.sortField
          ? JSON.stringify({ [state.sortField]: state.sortDirection }, null, 2)
          : state.bsonSort
        return {
          ...state,
          queryMode: "bson",
          queryInput: bsonFilter,
          bsonSort,
          bsonSortVisible: bsonSort !== "",
          bsonFocusedSection: "filter",
          sortField: null,
          sortDirection: -1,
          bsonExternalVersion: state.bsonExternalVersion + 1,
        }
      } else {
        // bson → simple: try to convert BSON filter back to simple Key:Value syntax
        // If the filter is a flat { key: primitiveValue } object we can round-trip it.
        // Otherwise fall back to the raw JSON string so nothing is lost.
        let simpleQuery = state.queryInput
        try {
          const filter = JSON.parse(state.queryInput.trim() || "{}")
          const tokens: string[] = []
          let canConvert = true
          for (const [key, val] of Object.entries(filter)) {
            if (val === null) { tokens.push(`${key}:null`); continue }
            if (typeof val === "string") { tokens.push(`${key}:${val.includes(" ") ? `"${val}"` : val}`); continue }
            if (typeof val === "number" || typeof val === "boolean") { tokens.push(`${key}:${val}`); continue }
            // Comparison operators: { $gt, $gte, $lt, $lte, $ne }
            if (typeof val === "object" && !Array.isArray(val)) {
              const ops = val as Record<string, unknown>
              const opMap: Record<string, string> = { $gt: ">", $gte: ">=", $lt: "<", $lte: "<=", $ne: "!=" }
              const entries = Object.entries(ops)
              if (entries.length === 1 && opMap[entries[0][0]]) {
                tokens.push(`${key}${opMap[entries[0][0]]}${entries[0][1]}`)
                continue
              }
            }
            canConvert = false
            break
          }
          simpleQuery = canConvert ? tokens.join(" ") : state.queryInput
        } catch {
          // Not valid JSON — leave as-is
        }
        return {
          ...state,
          queryMode: "simple",
          queryInput: simpleQuery,
          bsonFocusedSection: "filter",
        }
      }
    }

    case "SET_BSON_SORT":
      return { ...state, bsonSort: action.input }

    case "SET_BSON_PROJECTION":
      return { ...state, bsonProjection: action.input }

    case "SET_BSON_SECTION":
      return { ...state, bsonFocusedSection: action.section }

    case "CYCLE_BSON_SECTION": {
      const sections: BsonSection[] = ["filter"]
      if (state.bsonSortVisible) sections.push("sort")
      if (state.bsonProjectionVisible) sections.push("projection")
      const currentIdx = sections.indexOf(state.bsonFocusedSection)
      const nextIdx = (currentIdx + 1) % sections.length
      return { ...state, bsonFocusedSection: sections[nextIdx] }
    }

    case "TOGGLE_BSON_SORT": {
      const nowVisible = !state.bsonSortVisible
      return {
        ...state,
        bsonSortVisible: nowVisible,
        bsonFocusedSection: nowVisible ? "sort" : "filter",
        bsonSort: nowVisible ? state.bsonSort : "",
      }
    }

    case "TOGGLE_BSON_PROJECTION": {
      const nowVisible = !state.bsonProjectionVisible
      return {
        ...state,
        bsonProjectionVisible: nowVisible,
        bsonFocusedSection: nowVisible ? "projection" : "filter",
        bsonProjection: nowVisible ? state.bsonProjection : "",
      }
    }

    case "FORMAT_BSON_SECTION": {
      const section = state.bsonFocusedSection
      const raw = section === "filter" ? state.queryInput
        : section === "sort" ? state.bsonSort
        : state.bsonProjection
      let formatted = raw
      try {
        formatted = JSON.stringify(JSON.parse(raw.trim()), null, 2)
      } catch {
        // Not valid JSON yet — leave as-is
      }
      const ver = state.bsonExternalVersion + 1
      if (section === "filter") return { ...state, queryInput: formatted, bsonExternalVersion: ver }
      if (section === "sort") return { ...state, bsonSort: formatted, bsonExternalVersion: ver }
      return { ...state, bsonProjection: formatted, bsonExternalVersion: ver }
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

    // Pipeline
    case "SET_PIPELINE":
      return {
        ...state,
        pipeline: action.pipeline,
        pipelineSource: action.source,
        pipelineIsAggregate: action.isAggregate,
        pipelineVisible: true,
        // Clear simple filter when pipeline is set
        queryInput: "",
        queryMode: "simple",
        documentsLoading: true,
        reloadCounter: state.reloadCounter + 1,
        selectedIndex: 0,
      }

    case "CLEAR_PIPELINE":
      return {
        ...state,
        pipeline: [],
        pipelineSource: "",
        pipelineIsAggregate: false,
        pipelineVisible: false,
        // Reset to simple mode so the filter bar comes back cleanly
        queryMode: "simple",
        queryInput: "",
        documentsLoading: true,
        reloadCounter: state.reloadCounter + 1,
        selectedIndex: 0,
      }

    case "TOGGLE_PIPELINE_BAR":
      return { ...state, pipelineVisible: !state.pipelineVisible }

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
