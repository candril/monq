import { describe, test, expect } from "bun:test"
import { queryReducer } from "./query"
import { createInitialState } from "../../state"
import type { AppState } from "../../types"

function state(overrides: Partial<AppState> = {}): AppState {
  return { ...createInitialState(), ...overrides }
}

describe("TOGGLE_QUERY_MODE", () => {
  test("simple → bson converts filter", () => {
    const s = state({ queryMode: "simple", queryInput: "name:Alice" })
    const result = queryReducer(s, { type: "TOGGLE_QUERY_MODE" })!
    expect(result.queryMode).toBe("bson")
    // Should contain the parsed BSON filter
    expect(result.queryInput).toContain("name")
    expect(result.queryInput).toContain("Alice")
  })

  test("bson → simple converts back", () => {
    const s = state({ queryMode: "bson", queryInput: '{"name":"Alice"}', bsonProjection: "" })
    const result = queryReducer(s, { type: "TOGGLE_QUERY_MODE" })!
    expect(result.queryMode).toBe("simple")
    expect(result.queryInput).toContain("name")
  })

  test("simple → bson preserves sort as bsonSort", () => {
    const s = state({
      queryMode: "simple",
      queryInput: "",
      sortField: "age",
      sortDirection: -1,
    })
    const result = queryReducer(s, { type: "TOGGLE_QUERY_MODE" })!
    expect(result.queryMode).toBe("bson")
    expect(result.bsonSort).toContain("age")
    expect(result.bsonSort).toContain("-1")
    // Sort field should be cleared in simple mode since it's now in bsonSort
    expect(result.sortField).toBeNull()
  })
})

describe("SUBMIT_QUERY", () => {
  test("triggers reload and resets position", () => {
    const s = state({
      queryInput: "status:active",
      selectedIndex: 5,
      reloadCounter: 3,
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          collectionName: "users",
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
        },
      ],
    })
    const result = queryReducer(s, { type: "SUBMIT_QUERY" })!
    expect(result.documentsLoading).toBe(true)
    expect(result.reloadCounter).toBe(4)
    expect(result.selectedIndex).toBe(0)
    expect(result.queryVisible).toBe(false)
    // Tab query should be updated
    expect(result.tabs[0].query).toBe("status:active")
  })
})

describe("CLEAR_QUERY", () => {
  test("clears input and triggers reload", () => {
    const s = state({
      queryInput: "status:active",
      reloadCounter: 3,
      activeTabId: "tab-1",
      tabs: [
        {
          id: "tab-1",
          collectionName: "users",
          query: "status:active",
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
        },
      ],
    })
    const result = queryReducer(s, { type: "CLEAR_QUERY" })!
    expect(result.queryInput).toBe("")
    expect(result.reloadCounter).toBe(4)
    expect(result.tabs[0].query).toBe("")
  })
})

describe("OPEN_QUERY", () => {
  test("appends space in simple mode for token suggestions", () => {
    const s = state({ queryMode: "simple", queryInput: "name:Alice" })
    const result = queryReducer(s, { type: "OPEN_QUERY" })!
    expect(result.queryInput).toBe("name:Alice ")
    expect(result.queryVisible).toBe(true)
  })

  test("does not append space if already trailing", () => {
    const s = state({ queryMode: "simple", queryInput: "name:Alice " })
    const result = queryReducer(s, { type: "OPEN_QUERY" })!
    expect(result.queryInput).toBe("name:Alice ")
  })

  test("does not append space in bson mode", () => {
    const s = state({ queryMode: "bson", queryInput: '{"name":"Alice"}' })
    const result = queryReducer(s, { type: "OPEN_QUERY" })!
    expect(result.queryInput).toBe('{"name":"Alice"}')
  })
})

describe("APPEND_HISTORY_ENTRY", () => {
  test("prepends and deduplicates", () => {
    const s = state({ historyEntries: ["a", "b", "c"] })
    const result = queryReducer(s, { type: "APPEND_HISTORY_ENTRY", entry: "b" })!
    expect(result.historyEntries).toEqual(["b", "a", "c"])
  })

  test("caps at 100 entries", () => {
    const entries = Array.from({ length: 100 }, (_, i) => `q${i}`)
    const s = state({ historyEntries: entries })
    const result = queryReducer(s, { type: "APPEND_HISTORY_ENTRY", entry: "new" })!
    expect(result.historyEntries).toHaveLength(100)
    expect(result.historyEntries[0]).toBe("new")
  })
})
