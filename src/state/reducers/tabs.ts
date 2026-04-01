/** Reducer: tab management (open, close, clone, switch, undo) */

import type { Document } from "mongodb"
import type { AppState, Tab } from "../../types"
import type { AppAction } from "../../state"

// ── Helpers ──────────────────────────────────────────────────────────────────

let tabIdCounter = 0
export function generateTabId(): string {
  return `tab-${++tabIdCounter}-${Date.now()}`
}

export function snapshotTab(state: AppState, tabId: string, collectionName: string): Tab {
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

export function restoreFromTab(_state: AppState, tab: Tab): Partial<AppState> {
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

type MaybeObjectId = { toHexString?: () => string }

function idKey(id: unknown): string {
  const maybeId = id as MaybeObjectId
  return id != null && typeof maybeId.toHexString === "function"
    ? maybeId.toHexString()
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

// ── Reducer ──────────────────────────────────────────────────────────────────

export function tabsReducer(state: AppState, action: AppAction): AppState | null {
  switch (action.type) {
    case "OPEN_TAB": {
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

      const savedClosing =
        action.tabId === state.activeTabId
          ? snapshotTab(state, closingTab.id, closingTab.collectionName)
          : closingTab
      const closedTabs = [...state.closedTabs, savedClosing].slice(-10)

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

    case "RENAME_COLLECTION_TABS":
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.collectionName === action.oldName ? { ...t, collectionName: action.newName } : t,
        ),
      }

    default:
      return null
  }
}
