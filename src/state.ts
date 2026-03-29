/**
 * Application state management
 */

import type { Document } from "mongodb"
import type {
  AppState,
  BsonSection,
  BulkEditConfirmation,
  CollectionInfo,
  DeleteConfirmation,
  DetectedColumn,
  PreviewPosition,
  QueryMode,
  SelectionMode,
  Tab,
  View,
} from "./types"
import {
  parseSimpleQuery,
  parseSimpleQueryFull,
  projectionToSimple,
  simpleToBson,
  bsonToSimple,
} from "./query/parser"

// ============================================================================
// Actions
// ============================================================================

export type AppAction =
  // Connection
  | { type: "SET_CONNECTION_INFO"; dbName: string; host: string }
  | { type: "SET_ERROR"; error: string | null }
  // Database picker
  | { type: "SET_DATABASES"; databases: string[] }
  | { type: "OPEN_DB_PICKER" }
  | { type: "CLOSE_DB_PICKER" }
  | { type: "SELECT_DATABASE"; dbName: string }
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
  | { type: "LOAD_MORE" }
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
  | {
      type: "SET_PIPELINE"
      pipeline: import("mongodb").Document[]
      source: string
      isAggregate: boolean
    }
  | { type: "CLEAR_PIPELINE" }
  | { type: "ENTER_PIPELINE_MODE" }
  | { type: "ENTER_SIMPLE_MODE"; query: string }
  | { type: "SHOW_PIPELINE_CONFIRM"; simpleQuery: string }
  | { type: "DISMISS_PIPELINE_CONFIRM" }
  | { type: "CONFIRM_OVERWRITE_SIMPLE"; query: string }
  | { type: "CONFIRM_NEW_TAB_SIMPLE"; query: string }
  | { type: "ADD_PIPELINE_MATCH_CONDITION"; field: string; value: unknown }
  | { type: "START_PIPELINE_WATCH" }
  | { type: "STOP_PIPELINE_WATCH" }
  | { type: "TOGGLE_FILTER_BAR" }
  // Preview
  | { type: "TOGGLE_PREVIEW" }
  | { type: "CYCLE_PREVIEW_POSITION" }
  | { type: "SCROLL_PREVIEW"; delta: number }
  // Command palette
  | { type: "OPEN_COMMAND_PALETTE" }
  | { type: "CLOSE_COMMAND_PALETTE" }
  // Messages
  | { type: "SHOW_MESSAGE"; message: string; kind?: "info" | "success" | "warning" | "error" }
  | { type: "CLEAR_MESSAGE" }
  // Selection
  | { type: "ENTER_SELECTION_MODE" }
  | { type: "EXIT_SELECTION_MODE" }
  | { type: "FREEZE_SELECTION" }
  | { type: "TOGGLE_CURRENT_ROW" }
  | { type: "MOVE_SELECTION"; delta: number }
  | { type: "JUMP_SELECTION_END" }
  | { type: "SELECT_ALL" }
  | { type: "SHOW_BULK_EDIT_CONFIRM"; confirmation: BulkEditConfirmation }
  | { type: "CLEAR_BULK_EDIT_CONFIRM" }
  | { type: "SHOW_DELETE_CONFIRM"; confirmation: DeleteConfirmation }
  | { type: "CLEAR_DELETE_CONFIRM" }

// ============================================================================
// Helpers
// ============================================================================

// ============================================================================
// Initial State
// ============================================================================

export function createInitialState(): AppState {
  return {
    view: "collections",
    dbName: "",
    host: "",
    databases: [],
    dbPickerOpen: false,
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
    pipelineMode: false,
    pipeline: [],
    pipelineSource: "",
    pipelineIsAggregate: false,
    pipelineConfirm: null,
    pipelineWatching: false,
    filterBarVisible: true,
    loadedCount: 0,
    loadingMore: false,
    previewPosition: null,
    previewScrollOffset: 0,
    commandPaletteVisible: false,
    message: null,
    error: null,
    selectionMode: "none",
    selectedIds: new Set<string>(),
    frozenIds: new Set<string>(),
    selectedRows: new Set<number>(),
    selectionAnchor: null,
    bulkEditConfirmation: null,
    deleteConfirmation: null,
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
    selectionMode: state.selectionMode === "selecting" ? "selected" : state.selectionMode,
    selectedIds: new Set(state.selectedIds),
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
    selectionMode: tab.selectionMode,
    selectedIds: new Set(tab.selectedIds),
    frozenIds: new Set(tab.selectedIds),
    selectedRows: deriveSelectedRows(tab.documents, tab.selectedIds),
    selectionAnchor: null,
  }
}

// ============================================================================
// Selection Helpers
// ============================================================================

function idKey(id: unknown): string {
  return id != null && typeof (id as any).toHexString === "function"
    ? (id as any).toHexString()
    : String(id)
}

function deriveSelectedRows(documents: Document[], selectedIds: Set<string>): Set<number> {
  if (selectedIds.size === 0) return new Set()
  const rows = new Set<number>()
  for (let i = 0; i < documents.length; i++) {
    if (selectedIds.has(idKey(documents[i]._id))) rows.add(i)
  }
  return rows
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

    // Database picker
    case "SET_DATABASES":
      return { ...state, databases: action.databases }

    case "OPEN_DB_PICKER":
      return { ...state, dbPickerOpen: true }

    case "CLOSE_DB_PICKER":
      return { ...state, dbPickerOpen: false }

    case "SELECT_DATABASE":
      return {
        ...state,
        dbName: action.dbName,
        dbPickerOpen: false,
        // Reset all tabs and collections for the new database
        tabs: [],
        activeTabId: null,
        closedTabs: [],
        collections: [],
        collectionsLoading: true,
        collectionSelectedIndex: 0,
        // Reset document state
        documents: [],
        documentCount: 0,
        totalDocumentCount: 0,
        columns: [],
        schemaMap: new Map(),
        sortField: null,
        sortDirection: -1,
        queryInput: "",
        queryMode: "simple",
        bsonSort: "",
        bsonProjection: "",
        pipelineMode: false,
        pipeline: [],
        pipelineSource: "",
        selectionMode: "none",
        selectedIds: new Set(),
        frozenIds: new Set(),
        selectedRows: new Set(),
      }

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
        Math.min(state.collections.length - 1, state.collectionSelectedIndex + action.delta),
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
            t.id === state.activeTabId ? snapshotTab(state, t.id, t.collectionName) : t,
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
        selectionMode: "none",
        selectedIds: new Set(),
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
        selectionMode: "none",
        selectedIds: new Set(),
        frozenIds: new Set(),
        selectedRows: new Set(),
        selectionAnchor: null,
      }
    }

    case "CLONE_TAB": {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) return state

      // Save current state to active tab, then clone it
      const savedTabs = state.tabs.map((t) =>
        t.id === state.activeTabId ? snapshotTab(state, t.id, t.collectionName) : t,
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
      const savedClosing =
        action.tabId === state.activeTabId
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
            t.id === state.activeTabId ? snapshotTab(state, t.id, t.collectionName) : t,
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
        t.id === state.activeTabId ? snapshotTab(state, t.id, t.collectionName) : t,
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
      // Only trigger if not already loading and more docs exist
      if (state.loadingMore || state.loadedCount >= state.documentCount) return state
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
        Math.min(visibleCols.length - 1, state.selectedColumnIndex + action.delta),
      )
      return { ...state, selectedColumnIndex: newColIndex }
    }

    case "CYCLE_COLUMN_MODE": {
      const visibleCols = state.columns.filter((c) => c.visible)
      const targetCol = visibleCols[state.selectedColumnIndex]
      if (!targetCol) return state

      const nextMode = { normal: "full", full: "minimized", minimized: "normal" } as const
      const columns = state.columns.map((c) =>
        c.field === targetCol.field ? { ...c, displayMode: nextMode[c.displayMode] } : c,
      )
      return { ...state, columns }
    }

    // Query
    case "OPEN_QUERY": {
      // In simple mode: append space so suggestions show new tokens, not completions.
      // In BSON mode: just show the bar as-is.
      const queryWithSpace =
        state.queryMode === "simple" && state.queryInput && !state.queryInput.endsWith(" ")
          ? state.queryInput + " "
          : state.queryInput
      return { ...state, queryVisible: true, queryInput: queryWithSpace }
    }

    case "OPEN_QUERY_BSON": {
      // Open the query bar in BSON mode. If currently in simple mode, migrate first.
      if (state.queryMode === "bson") {
        return { ...state, queryVisible: true }
      }
      const { bsonFilter, bsonSort, bsonProjection } = simpleToBson(
        state.queryInput,
        state.schemaMap,
        state.sortField,
        state.sortDirection,
        state.bsonSort,
        state.bsonProjection,
      )
      return {
        ...state,
        queryVisible: true,
        queryMode: "bson",
        queryInput: bsonFilter,
        bsonSort,
        bsonProjection,
        bsonSortVisible: bsonSort !== "",
        bsonProjectionVisible: bsonProjection !== "",
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
        // simple → bson
        const { bsonFilter, bsonSort, bsonProjection } = simpleToBson(
          state.queryInput,
          state.schemaMap,
          state.sortField,
          state.sortDirection,
          state.bsonSort,
          state.bsonProjection,
        )
        return {
          ...state,
          queryMode: "bson",
          queryInput: bsonFilter,
          bsonSort,
          bsonProjection,
          bsonSortVisible: bsonSort !== "",
          bsonProjectionVisible: bsonProjection !== "",
          bsonFocusedSection: "filter",
          sortField: null,
          sortDirection: -1,
          bsonExternalVersion: state.bsonExternalVersion + 1,
        }
      } else {
        // bson → simple
        return {
          ...state,
          queryMode: "simple",
          queryInput: bsonToSimple(state.queryInput, state.bsonProjection),
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
      const raw =
        section === "filter"
          ? state.queryInput
          : section === "sort"
            ? state.bsonSort
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
            : t,
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
        tabs: state.tabs.map((t) => (t.id === state.activeTabId ? { ...t, query: "" } : t)),
      }

    // Pipeline
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
      }

    // Tab switches mode: simple → pipeline (no reload — same data, just display change)
    case "ENTER_PIPELINE_MODE": {
      const stages: import("mongodb").Document[] = []
      const { filter: enterFilter, projection: enterProj } = parseSimpleQueryFull(
        state.queryInput,
        state.schemaMap,
      )
      try {
        if (Object.keys(enterFilter).length > 0) stages.push({ $match: enterFilter })
      } catch {
        /* skip */
      }
      if (state.sortField) {
        stages.push({ $sort: { [state.sortField]: state.sortDirection } })
      }
      if (enterProj) stages.push({ $project: enterProj })
      return {
        ...state,
        pipelineMode: true,
        pipeline: stages,
        pipelineSource: "",
        pipelineIsAggregate: false,
        pipelineConfirm: null,
        queryVisible: false,
        // Keep queryInput + sortField — they are the source of truth in simple mode
        // No reload needed: data is already shown with the same filter
      }
    }

    // Tab switches mode: pipeline → simple (lossless)
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

    // Tab pipeline→simple but lossy: show confirm dialog
    case "SHOW_PIPELINE_CONFIRM":
      return { ...state, pipelineConfirm: { simpleQuery: action.simpleQuery } }

    case "DISMISS_PIPELINE_CONFIRM":
      return { ...state, pipelineConfirm: null }

    // Confirm: overwrite simple filter with translated query, reload
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

    // Confirm: open new tab with clean filter (handled in App.tsx via CLONE_TAB + CLEAR_PIPELINE)
    case "CONFIRM_NEW_TAB_SIMPLE":
      return { ...state, pipelineConfirm: null }

    case "ADD_PIPELINE_MATCH_CONDITION": {
      // Add/merge a field:value condition into the $match stage of the pipeline.
      // Only supported when pipeline has a $match stage (find-compatible).
      const matchIdx = state.pipeline.findIndex((s) => "$match" in s)
      if (matchIdx === -1) return state // no $match — caller should show toast

      const updatedPipeline = state.pipeline.map((stage, i) => {
        if (i !== matchIdx) return stage
        const existingMatch = (stage as any).$match ?? {}
        return { $match: { ...existingMatch, [action.field]: action.value } }
      })

      // Regenerate source JSON
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
      return { ...state, message: { text: action.message, kind: action.kind ?? "info" } }

    case "CLEAR_MESSAGE":
      return { ...state, message: null }

    // Selection
    case "ENTER_SELECTION_MODE": {
      if (state.selectionMode === "selecting") return state
      const anchor = state.selectedIndex
      const doc = state.documents[anchor]
      const frozenIds = new Set(state.selectedIds)
      const selectedIds = new Set(frozenIds)
      if (doc?._id !== undefined) selectedIds.add(idKey(doc._id))
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
      if (state.selectionMode !== "selecting") return state
      return {
        ...state,
        selectionMode: "selected",
        frozenIds: new Set(state.selectedIds),
        selectionAnchor: null,
      }

    case "TOGGLE_CURRENT_ROW": {
      const doc = state.documents[state.selectedIndex]
      if (!doc || doc._id === undefined) return state
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
          if (id !== undefined) selectedIds.add(idKey(id))
        }
        const selectedRows = deriveSelectedRows(state.documents, selectedIds)
        return { ...state, selectedIndex: newIndex, selectedIds, selectedRows }
      }
      return { ...state, selectedIndex: newIndex }
    }

    case "JUMP_SELECTION_END": {
      if (state.selectionMode !== "selecting" || state.selectionAnchor === null) return state
      return {
        ...state,
        selectedIndex: state.selectionAnchor,
        selectionAnchor: state.selectedIndex,
      }
    }

    case "SELECT_ALL": {
      const selectedIds = new Set(state.selectedIds)
      for (const doc of state.documents) {
        if (doc._id !== undefined) selectedIds.add(idKey(doc._id))
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

    case "SHOW_BULK_EDIT_CONFIRM":
      return { ...state, bulkEditConfirmation: action.confirmation }

    case "CLEAR_BULK_EDIT_CONFIRM":
      return { ...state, bulkEditConfirmation: null }

    case "SHOW_DELETE_CONFIRM":
      return { ...state, deleteConfirmation: action.confirmation }

    case "CLEAR_DELETE_CONFIRM":
      return { ...state, deleteConfirmation: null }

    case "START_PIPELINE_WATCH":
      return { ...state, pipelineWatching: true }

    case "STOP_PIPELINE_WATCH":
      return { ...state, pipelineWatching: false }

    case "TOGGLE_FILTER_BAR":
      return { ...state, filterBarVisible: !state.filterBarVisible }

    default:
      return state
  }
}
