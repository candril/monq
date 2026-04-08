import { describe, test, expect } from "bun:test"
import { tabsReducer } from "./tabs"
import { createInitialState } from "../../state"
import type { AppState, Tab } from "../../types"

function state(overrides: Partial<AppState> = {}): AppState {
  return { ...createInitialState(), ...overrides }
}

function makeTab(id: string, collection: string, overrides: Partial<Tab> = {}): Tab {
  return {
    id,
    collectionName: collection,
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
    ...overrides,
  }
}

describe("OPEN_TAB", () => {
  test("creates a new tab and activates it", () => {
    const s = state()
    const result = tabsReducer(s, { type: "OPEN_TAB", collectionName: "users" })!
    expect(result.tabs).toHaveLength(1)
    expect(result.tabs[0].collectionName).toBe("users")
    expect(result.activeTabId).toBe(result.tabs[0].id)
    expect(result.documentsLoading).toBe(true)
    expect(result.view).toBe("documents")
  })

  test("snapshots current tab before opening new one", () => {
    const tab1 = makeTab("tab-1", "users")
    const s = state({
      tabs: [tab1],
      activeTabId: "tab-1",
      queryInput: "name:Alice",
      selectedIndex: 3,
    })
    const result = tabsReducer(s, { type: "OPEN_TAB", collectionName: "orders" })!
    expect(result.tabs).toHaveLength(2)
    // Old tab should have the snapshotted query
    expect(result.tabs[0].query).toBe("name:Alice")
    expect(result.tabs[0].selectedIndex).toBe(3)
    // New tab should be clean
    expect(result.queryInput).toBe("")
    expect(result.selectedIndex).toBe(0)
  })
})

describe("CLOSE_TAB", () => {
  test("closes the only tab and returns to collections view", () => {
    const tab1 = makeTab("tab-1", "users")
    const s = state({ tabs: [tab1], activeTabId: "tab-1" })
    const result = tabsReducer(s, { type: "CLOSE_TAB", tabId: "tab-1" })!
    expect(result.tabs).toHaveLength(0)
    expect(result.activeTabId).toBeNull()
    expect(result.view).toBe("collections")
  })

  test("activates adjacent tab after closing", () => {
    const tabs = [makeTab("t1", "a"), makeTab("t2", "b"), makeTab("t3", "c")]
    const s = state({ tabs, activeTabId: "t2" })
    const result = tabsReducer(s, { type: "CLOSE_TAB", tabId: "t2" })!
    expect(result.tabs).toHaveLength(2)
    // Should activate t2's position → t3 (index 1)
    expect(result.activeTabId).toBe("t3")
  })

  test("saves closed tab for undo (up to 10)", () => {
    const tab1 = makeTab("tab-1", "users")
    const s = state({ tabs: [tab1, makeTab("t2", "b")], activeTabId: "tab-1" })
    const result = tabsReducer(s, { type: "CLOSE_TAB", tabId: "tab-1" })!
    expect(result.closedTabs).toHaveLength(1)
    expect(result.closedTabs[0].id).toBe("tab-1")
  })
})

describe("SWITCH_TAB", () => {
  test("snapshots current tab and restores target", () => {
    const tab1 = makeTab("t1", "users", { query: "saved-query" })
    const tab2 = makeTab("t2", "orders", { query: "order-query" })
    const s = state({
      tabs: [tab1, tab2],
      activeTabId: "t1",
      queryInput: "current-input",
    })
    const result = tabsReducer(s, { type: "SWITCH_TAB", tabId: "t2" })!
    expect(result.activeTabId).toBe("t2")
    expect(result.queryInput).toBe("order-query")
    // Tab 1 should be snapshotted with current input
    expect(result.tabs[0].query).toBe("current-input")
  })

  test("noop if switching to same tab", () => {
    const s = state({ tabs: [makeTab("t1", "users")], activeTabId: "t1" })
    expect(tabsReducer(s, { type: "SWITCH_TAB", tabId: "t1" })).toBe(s)
  })

  test("noop if target tab does not exist", () => {
    const s = state({ tabs: [makeTab("t1", "users")], activeTabId: "t1" })
    const result = tabsReducer(s, { type: "SWITCH_TAB", tabId: "nonexistent" })!
    expect(result).toBe(s)
  })
})

describe("UNDO_CLOSE_TAB", () => {
  test("restores last closed tab", () => {
    const closedTab = makeTab("closed-1", "users", { query: "old-query" })
    const s = state({ closedTabs: [closedTab] })
    const result = tabsReducer(s, { type: "UNDO_CLOSE_TAB" })!
    expect(result.tabs).toHaveLength(1)
    expect(result.tabs[0].id).toBe("closed-1")
    expect(result.activeTabId).toBe("closed-1")
    expect(result.queryInput).toBe("old-query")
    expect(result.closedTabs).toHaveLength(0)
  })

  test("noop if no closed tabs", () => {
    const s = state({ closedTabs: [] })
    expect(tabsReducer(s, { type: "UNDO_CLOSE_TAB" })).toBe(s)
  })
})

describe("CLONE_TAB", () => {
  test("creates a copy of the active tab", () => {
    const tab1 = makeTab("t1", "users")
    const s = state({
      tabs: [tab1],
      activeTabId: "t1",
      queryInput: "name:Alice",
    })
    const result = tabsReducer(s, { type: "CLONE_TAB" })!
    expect(result.tabs).toHaveLength(2)
    expect(result.tabs[1].collectionName).toBe("users")
    expect(result.activeTabId).toBe(result.tabs[1].id)
    expect(result.activeTabId).not.toBe("t1")
    expect(result.documentsLoading).toBe(true)
  })

  test("noop if no active tab", () => {
    const s = state({ activeTabId: null })
    expect(tabsReducer(s, { type: "CLONE_TAB" })).toBe(s)
  })
})

describe("RENAME_COLLECTION_TABS", () => {
  test("renames matching tabs", () => {
    const tabs = [makeTab("t1", "users"), makeTab("t2", "orders"), makeTab("t3", "users")]
    const s = state({ tabs })
    const result = tabsReducer(s, {
      type: "RENAME_COLLECTION_TABS",
      oldName: "users",
      newName: "people",
    })!
    expect(result.tabs[0].collectionName).toBe("people")
    expect(result.tabs[1].collectionName).toBe("orders")
    expect(result.tabs[2].collectionName).toBe("people")
  })
})
