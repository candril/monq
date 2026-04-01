/** Reducer: connection, database picker, and collection browser */

import type { AppState } from "../../types"
import type { AppAction } from "../../state"

export function connectionReducer(state: AppState, action: AppAction): AppState | null {
  switch (action.type) {
    case "SET_CONNECTION_INFO":
      return { ...state, dbName: action.dbName, host: action.host }

    case "SET_ERROR":
      return { ...state, error: action.error, collectionsLoading: false, documentsLoading: false }

    case "SET_DATABASES":
      return {
        ...state,
        databases: action.databases,
        databasesLoading: false,
        collectionsLoading: state.dbName ? state.collectionsLoading : false,
      }

    case "SET_DATABASES_LOADING":
      return { ...state, databasesLoading: action.loading }

    case "OPEN_DB_PICKER":
      return { ...state, dbPickerOpen: true }

    case "CLOSE_DB_PICKER":
      return { ...state, dbPickerOpen: false }

    case "RESET_DATABASE":
      return {
        ...state,
        dbName: "",
        dbPickerOpen: false,
        tabs: [],
        activeTabId: null,
        closedTabs: [],
        collections: [],
        collectionsLoading: false,
        collectionSelectedIndex: 0,
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

    case "SELECT_DATABASE":
      return {
        ...state,
        dbName: action.dbName,
        dbPickerOpen: false,
        tabs: [],
        activeTabId: null,
        closedTabs: [],
        collections: [],
        collectionsLoading: true,
        collectionSelectedIndex: 0,
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

    case "SET_COLLECTIONS":
      return { ...state, collections: action.collections, collectionsLoading: false }

    case "SET_COLLECTIONS_LOADING":
      return { ...state, collectionsLoading: action.loading }

    case "CREATE_DATABASE":
    case "CREATE_COLLECTION":
      return state

    case "SELECT_COLLECTION":
      return { ...state, collectionSelectedIndex: action.index }

    case "MOVE_COLLECTION": {
      const newIndex = Math.max(
        0,
        Math.min(state.collections.length - 1, state.collectionSelectedIndex + action.delta),
      )
      return { ...state, collectionSelectedIndex: newIndex }
    }

    case "SET_VIEW":
      return { ...state, view: action.view }

    default:
      return null
  }
}
