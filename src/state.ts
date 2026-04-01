/**
 * Application state management.
 *
 * The reducer is split into domain sub-reducers under state/reducers/.
 * This file defines the AppAction union, initial state, and the
 * top-level router that delegates to each sub-reducer.
 */

import type {
  AppState,
  BsonSection,
  BulkEditConfirmation,
  BulkQueryUpdateConfirmation,
  BulkQueryDeleteConfirmation,
  CollectionInfo,
  DeleteConfirmation,
  DetectedColumn,
  IndexCreateConfirmation,
  QueryMode,
  View,
} from "./types"

// Sub-reducers
import { connectionReducer } from "./state/reducers/connection"
import { tabsReducer } from "./state/reducers/tabs"
import { documentsReducer } from "./state/reducers/documents"
import { queryReducer } from "./state/reducers/query"
import { pipelineReducer } from "./state/reducers/pipeline"
import { selectionReducer } from "./state/reducers/selection"
import { uiReducer } from "./state/reducers/ui"

// Re-export tab helpers for use in other modules
export { snapshotTab, restoreFromTab } from "./state/reducers/tabs"

// ============================================================================
// Actions
// ============================================================================

export type AppAction =
  // Connection
  | { type: "SET_CONNECTION_INFO"; dbName: string; host: string }
  | { type: "SET_ERROR"; error: string | null }
  // Database picker
  | { type: "SET_DATABASES"; databases: string[] }
  | { type: "SET_DATABASES_LOADING"; loading: boolean }
  | { type: "OPEN_DB_PICKER" }
  | { type: "CLOSE_DB_PICKER" }
  | { type: "SELECT_DATABASE"; dbName: string }
  | { type: "RESET_DATABASE" }
  // Collections
  | { type: "SET_COLLECTIONS"; collections: CollectionInfo[] }
  | { type: "SET_COLLECTIONS_LOADING"; loading: boolean }
  // Create
  | { type: "CREATE_DATABASE"; dbName: string; firstCollection: string }
  | { type: "CREATE_COLLECTION"; collectionName: string }
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
  | {
      type: "SET_DOCUMENTS"
      documents: import("mongodb").Document[]
      count: number
      totalCount?: number
    }
  | { type: "APPEND_DOCUMENTS"; documents: import("mongodb").Document[] }
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
  | { type: "SET_PREVIEW_MODE"; mode: import("./types").PreviewMode }
  // Explain
  | { type: "SET_EXPLAIN_RESULT"; result: import("mongodb").Document | null; limited?: boolean }
  | { type: "SET_EXPLAIN_LOADING"; loading: boolean }
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
  | { type: "SHOW_BULK_QUERY_UPDATE_CONFIRM"; confirmation: BulkQueryUpdateConfirmation }
  | { type: "CLEAR_BULK_QUERY_UPDATE_CONFIRM" }
  | { type: "SHOW_BULK_QUERY_DELETE_CONFIRM"; confirmation: BulkQueryDeleteConfirmation }
  | { type: "CLEAR_BULK_QUERY_DELETE_CONFIRM" }
  | { type: "SHOW_DROP_CONFIRM"; confirmation: import("./types").DropConfirmation }
  | { type: "CLEAR_DROP_CONFIRM" }
  | { type: "SHOW_CREATE_INPUT"; input: import("./types").CreateInput }
  | { type: "CLEAR_CREATE_INPUT" }
  | { type: "SHOW_RENAME_INPUT"; input: import("./types").RenameInput }
  | { type: "CLEAR_RENAME_INPUT" }
  | { type: "RENAME_COLLECTION_TABS"; oldName: string; newName: string }
  // History
  | { type: "LOAD_HISTORY"; entries: string[] }
  | { type: "APPEND_HISTORY_ENTRY"; entry: string }
  | { type: "OPEN_HISTORY_PICKER" }
  | { type: "CLOSE_HISTORY_PICKER" }
  // Index create confirmation
  | { type: "SHOW_INDEX_CREATE_CONFIRM"; confirmation: IndexCreateConfirmation }
  | { type: "CLEAR_INDEX_CREATE_CONFIRM" }

// ============================================================================
// Initial State
// ============================================================================

export function createInitialState(): AppState {
  return {
    view: "collections",
    dbName: "",
    host: "",
    databases: [],
    databasesLoading: true,
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
    previewMode: "document",
    previewScrollOffset: 0,
    explainResult: null,
    explainLimited: false,
    explainLoading: false,
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
    bulkQueryUpdateConfirmation: null,
    bulkQueryDeleteConfirmation: null,
    dropConfirmation: null,
    createInput: null,
    renameInput: null,
    historyEntries: [],
    historyPickerOpen: false,
    indexCreateConfirmation: null,
  }
}

// ============================================================================
// Router
// ============================================================================

const reducers = [
  connectionReducer,
  tabsReducer,
  documentsReducer,
  queryReducer,
  pipelineReducer,
  selectionReducer,
  uiReducer,
]

export function appReducer(state: AppState, action: AppAction): AppState {
  for (const reducer of reducers) {
    const result = reducer(state, action)
    if (result !== null) return result
  }
  return state
}
