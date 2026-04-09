/** Reducer: tab management (open, close, clone, switch, undo) */

import type { Document } from "mongodb"
import type { AppState, Tab } from "../../types"
import type { AppAction } from "../../state"

/**
 * Move the sidebar cursor to the collection in the active tab.
 * Used by OPEN_TAB / SWITCH_TAB so the sidebar tracks tab-switching. Returns
 * the current index unchanged if the collection isn't in state.collections
 * (e.g. during the startup window before SET_COLLECTIONS lands).
 */
function sidebarIndexForCollection(state: AppState, collectionName: string): number {
  const idx = state.collections.findIndex((c) => c.name === collectionName)
  return idx === -1 ? state.sidebarSelectedIndex : idx
}

/** Construct a fresh Tab for a collection — no query, default columns, etc. */
export function makeFreshTab(id: string, collectionName: string): Tab {
  return {
    id,
    collectionName,
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
    pipelineMode: false,
    pipeline: [],
    pipelineSource: "",
    pipelineIsAggregate: false,
    pipelineWatching: false,
  }
}

/**
 * Fields of AppState that need to be reset when opening (or peeking) a fresh
 * tab. Kept as a partial so callers can spread it alongside their own
 * overrides.
 */
export function freshTabAppStateReset(): Partial<AppState> {
  return {
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
    pipelineMode: false,
    pipeline: [],
    pipelineSource: "",
    pipelineIsAggregate: false,
    pipelineWatching: false,
  }
}

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
    pipelineMode: state.pipelineMode,
    pipeline: state.pipeline,
    pipelineSource: state.pipelineSource,
    pipelineIsAggregate: state.pipelineIsAggregate,
    pipelineWatching: state.pipelineWatching,
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
    pipelineMode: tab.pipelineMode,
    pipeline: tab.pipeline,
    pipelineSource: tab.pipelineSource,
    pipelineIsAggregate: tab.pipelineIsAggregate,
    pipelineWatching: tab.pipelineWatching,
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

// ── Reducer ──────────────────────────────────────────────────────────────────

export function tabsReducer(state: AppState, action: AppAction): AppState | null {
  switch (action.type) {
    case "OPEN_TAB": {
      // Drop any ephemeral tab — OPEN_TAB is an explicit "commit to a new
      // tab" gesture and shouldn't coexist with a peek.
      const baseTabs = state.tabs.filter((t) => !t.ephemeral)
      const savedTabs = state.activeTabId
        ? baseTabs.map((t) =>
            t.id === state.activeTabId ? snapshotTab(state, t.id, t.collectionName) : t,
          )
        : baseTabs

      const newTab = makeFreshTab(generateTabId(), action.collectionName)
      return {
        ...state,
        ...freshTabAppStateReset(),
        tabs: [...savedTabs, newTab],
        activeTabId: newTab.id,
        view: "documents",
        preEphemeralTabId: null,
        sidebarSelectedIndex: sidebarIndexForCollection(state, action.collectionName),
      }
    }

    case "PEEK_COLLECTION": {
      if (state.collections.length === 0) {
        return state
      }

      const ephemeral = state.tabs.find((t) => t.ephemeral)
      const len = state.collections.length
      const anchor = action.anchor ?? "active"

      // Compute the target index. Two modes:
      //   - "cursor": walk from the sidebar cursor, clamping at the ends.
      //     Used by sidebar j/k — the user is navigating a visible list and
      //     expects list semantics (no wrap, no jumping back to wherever the
      //     active tab happens to sit).
      //   - "active": walk from the active/ephemeral tab, wrapping at the
      //     ends. Used by global `}` / `{` — the user is cycling through
      //     collections regardless of which one is focused in the sidebar.
      let nextIdx: number
      if (anchor === "cursor") {
        nextIdx = Math.max(0, Math.min(len - 1, state.sidebarSelectedIndex + action.delta))
      } else {
        const anchorTab = ephemeral ?? state.tabs.find((t) => t.id === state.activeTabId)
        const anchorName = anchorTab?.collectionName
        const currentIdx = anchorName
          ? state.collections.findIndex((c) => c.name === anchorName)
          : -1
        nextIdx =
          currentIdx === -1
            ? action.delta > 0
              ? 0
              : len - 1
            : (currentIdx + action.delta + len) % len
      }
      const nextCol = state.collections[nextIdx]

      // No-op: target is already the active/ephemeral collection. Without
      // this, sidebar j at the last row would flash the reducer's
      // snapshot/restore dance for no visible change. The cursor-clamping
      // branch is the main trigger.
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (activeTab?.collectionName === nextCol.name) {
        return state.sidebarSelectedIndex === nextIdx
          ? state
          : { ...state, sidebarSelectedIndex: nextIdx }
      }

      // If a real tab already exists for the target collection, switch to it
      // and discard any ephemeral tab as a side effect.
      const existingReal = state.tabs.find((t) => t.collectionName === nextCol.name && !t.ephemeral)
      if (existingReal) {
        const baseTabs = ephemeral ? state.tabs.filter((t) => !t.ephemeral) : state.tabs
        // Snapshot the currently-active real tab (if any) before switching
        // away from it. Don't snapshot while we're currently on the
        // ephemeral — its state is transient and about to be discarded.
        const savedTabs =
          state.activeTabId && !ephemeral
            ? baseTabs.map((t) =>
                t.id === state.activeTabId ? snapshotTab(state, t.id, t.collectionName) : t,
              )
            : baseTabs
        const target = savedTabs.find((t) => t.id === existingReal.id)
        if (!target) {
          return state
        }
        return {
          ...state,
          ...restoreFromTab(state, target),
          tabs: savedTabs,
          activeTabId: existingReal.id,
          preEphemeralTabId: null,
          sidebarSelectedIndex: sidebarIndexForCollection(state, nextCol.name),
        }
      }

      // Otherwise: create or update the ephemeral tab with a fresh state
      // for the target collection.
      if (ephemeral) {
        const reset: Tab = { ...makeFreshTab(ephemeral.id, nextCol.name), ephemeral: true }
        return {
          ...state,
          ...freshTabAppStateReset(),
          tabs: state.tabs.map((t) => (t.ephemeral ? reset : t)),
          activeTabId: ephemeral.id,
          view: "documents",
          sidebarSelectedIndex: sidebarIndexForCollection(state, nextCol.name),
        }
      }

      // No ephemeral yet — start a peek session. Snapshot the current tab
      // (so switching back via discard restores its state) and remember its
      // id as the restore target.
      const savedTabs = state.activeTabId
        ? state.tabs.map((t) =>
            t.id === state.activeTabId ? snapshotTab(state, t.id, t.collectionName) : t,
          )
        : state.tabs
      const newEphemeral: Tab = {
        ...makeFreshTab(generateTabId(), nextCol.name),
        ephemeral: true,
      }
      return {
        ...state,
        ...freshTabAppStateReset(),
        tabs: [...savedTabs, newEphemeral],
        activeTabId: newEphemeral.id,
        preEphemeralTabId: state.activeTabId,
        view: "documents",
        sidebarSelectedIndex: sidebarIndexForCollection(state, nextCol.name),
      }
    }

    case "PROMOTE_EPHEMERAL_TAB": {
      if (!state.tabs.some((t) => t.ephemeral)) {
        return state
      }
      return {
        ...state,
        tabs: state.tabs.map((t) => (t.ephemeral ? { ...t, ephemeral: false } : t)),
        preEphemeralTabId: null,
      }
    }

    case "DISCARD_EPHEMERAL_TAB": {
      const ephemeral = state.tabs.find((t) => t.ephemeral)
      if (!ephemeral) {
        return state
      }
      const remaining = state.tabs.filter((t) => !t.ephemeral)
      // Restore the pre-peek tab if it still exists; otherwise fall back to
      // the most recent remaining tab, or to null if none are left.
      const restoreId =
        state.preEphemeralTabId && remaining.some((t) => t.id === state.preEphemeralTabId)
          ? state.preEphemeralTabId
          : (remaining[remaining.length - 1]?.id ?? null)
      const restoreTab = restoreId ? remaining.find((t) => t.id === restoreId) : null
      return {
        ...state,
        ...(restoreTab ? restoreFromTab(state, restoreTab) : {}),
        tabs: remaining,
        activeTabId: restoreId,
        preEphemeralTabId: null,
        view: restoreTab ? "documents" : "collections",
        sidebarSelectedIndex: restoreTab
          ? sidebarIndexForCollection(state, restoreTab.collectionName)
          : state.sidebarSelectedIndex,
      }
    }

    case "CLONE_TAB": {
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (!activeTab) {
        return state
      }

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
      if (!closingTab) {
        return state
      }

      // Ephemeral tabs are never pushed onto the closedTabs undo stack —
      // they were transient by design, undoing them makes no sense.
      const savedClosing =
        action.tabId === state.activeTabId
          ? snapshotTab(state, closingTab.id, closingTab.collectionName)
          : closingTab
      const closedTabs = closingTab.ephemeral
        ? state.closedTabs
        : [...state.closedTabs, savedClosing].slice(-10)
      // If we're closing the ephemeral tab, drop the restore pointer.
      const preEphemeralTabId = closingTab.ephemeral ? null : state.preEphemeralTabId

      if (state.tabs.length <= 1) {
        return {
          ...state,
          tabs: [],
          activeTabId: null,
          closedTabs,
          preEphemeralTabId,
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
        preEphemeralTabId,
        documents: needNewActive ? [] : state.documents,
        documentsLoading: needNewActive,
        documentCount: needNewActive ? 0 : state.documentCount,
        totalDocumentCount: needNewActive ? 0 : state.totalDocumentCount,
        reloadCounter: needNewActive ? state.reloadCounter + 1 : state.reloadCounter,
      }
    }

    case "UNDO_CLOSE_TAB": {
      if (state.closedTabs.length === 0) {
        return state
      }

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
      if (action.tabId === state.activeTabId) {
        return state
      }

      const targetTabRaw = state.tabs.find((t) => t.id === action.tabId)
      if (!targetTabRaw) {
        return state
      }

      // If switching to a real tab while an ephemeral tab exists, discard
      // the ephemeral as a side effect. If switching to the ephemeral itself
      // (unusual but possible), keep both.
      const ephemeral = state.tabs.find((t) => t.ephemeral)
      const discardingEphemeral = ephemeral != null && !targetTabRaw.ephemeral

      // Snapshot the currently-active tab unless it's the one we're about
      // to discard — no point saving state we're throwing away.
      const activeIsEphemeral = ephemeral != null && state.activeTabId === ephemeral.id
      const tabsWithSnapshot =
        state.activeTabId && !activeIsEphemeral
          ? state.tabs.map((t) =>
              t.id === state.activeTabId ? snapshotTab(state, t.id, t.collectionName) : t,
            )
          : state.tabs

      const nextTabs = discardingEphemeral
        ? tabsWithSnapshot.filter((t) => !t.ephemeral)
        : tabsWithSnapshot

      const targetTab = nextTabs.find((t) => t.id === action.tabId)
      if (!targetTab) {
        return state
      }

      return {
        ...state,
        ...restoreFromTab(state, targetTab),
        tabs: nextTabs,
        activeTabId: action.tabId,
        preEphemeralTabId: discardingEphemeral ? null : state.preEphemeralTabId,
        sidebarSelectedIndex: sidebarIndexForCollection(state, targetTab.collectionName),
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
