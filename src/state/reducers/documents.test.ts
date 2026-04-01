import { describe, test, expect } from "bun:test"
import { documentsReducer } from "./documents"
import { createInitialState } from "../../state"
import type { AppState } from "../../types"

function state(overrides: Partial<AppState> = {}): AppState {
  return { ...createInitialState(), ...overrides }
}

describe("CYCLE_SORT", () => {
  test("none → asc on first click", () => {
    const s = state({ sortField: null, sortDirection: -1 })
    const result = documentsReducer(s, { type: "CYCLE_SORT", field: "name" })!
    expect(result.sortField).toBe("name")
    expect(result.sortDirection).toBe(1)
    expect(result.documentsLoading).toBe(true)
  })

  test("asc → desc on second click", () => {
    const s = state({ sortField: "name", sortDirection: 1 })
    const result = documentsReducer(s, { type: "CYCLE_SORT", field: "name" })!
    expect(result.sortField).toBe("name")
    expect(result.sortDirection).toBe(-1)
  })

  test("desc → none on third click", () => {
    const s = state({ sortField: "name", sortDirection: -1 })
    const result = documentsReducer(s, { type: "CYCLE_SORT", field: "name" })!
    expect(result.sortField).toBeNull()
    expect(result.sortDirection).toBe(-1)
  })

  test("clicking different field resets to asc", () => {
    const s = state({ sortField: "name", sortDirection: -1 })
    const result = documentsReducer(s, { type: "CYCLE_SORT", field: "age" })!
    expect(result.sortField).toBe("age")
    expect(result.sortDirection).toBe(1)
  })

  test("resets selectedIndex to 0", () => {
    const s = state({ sortField: null, selectedIndex: 5 })
    const result = documentsReducer(s, { type: "CYCLE_SORT", field: "name" })!
    expect(result.selectedIndex).toBe(0)
  })

  test("pipeline mode: inserts $sort after $match", () => {
    const s = state({
      pipelineMode: true,
      pipeline: [{ $match: { status: "active" } }],
    })
    const result = documentsReducer(s, { type: "CYCLE_SORT", field: "name" })!
    expect(result.pipeline).toHaveLength(2)
    expect(result.pipeline[1]).toEqual({ $sort: { name: 1 } })
  })

  test("pipeline mode: replaces existing $sort", () => {
    const s = state({
      pipelineMode: true,
      pipeline: [{ $match: {} }, { $sort: { name: 1 } }],
    })
    const result = documentsReducer(s, { type: "CYCLE_SORT", field: "name" })!
    expect(result.pipeline[1]).toEqual({ $sort: { name: -1 } })
  })

  test("pipeline mode: removes $sort when cycling to none", () => {
    const s = state({
      pipelineMode: true,
      pipeline: [{ $match: {} }, { $sort: { name: -1 } }],
    })
    const result = documentsReducer(s, { type: "CYCLE_SORT", field: "name" })!
    expect(result.pipeline).toHaveLength(1)
    expect(result.pipeline[0]).toEqual({ $match: {} })
  })
})

describe("SET_DOCUMENTS", () => {
  test("clamps selectedIndex to last document", () => {
    const s = state({ selectedIndex: 10 })
    const result = documentsReducer(s, {
      type: "SET_DOCUMENTS",
      documents: [{ _id: "a" }, { _id: "b" }],
      count: 2,
    })!
    expect(result.selectedIndex).toBe(1)
  })

  test("preserves selected rows from selectedIds", () => {
    const s = state({ selectedIds: new Set(["b"]) })
    const result = documentsReducer(s, {
      type: "SET_DOCUMENTS",
      documents: [{ _id: "a" }, { _id: "b" }, { _id: "c" }],
      count: 3,
    })!
    expect(result.selectedRows.has(1)).toBe(true)
    expect(result.selectedRows.size).toBe(1)
  })
})

describe("LOAD_MORE", () => {
  test("does nothing when already loading", () => {
    const s = state({ loadingMore: true, loadedCount: 10, documentCount: 50 })
    expect(documentsReducer(s, { type: "LOAD_MORE" })).toBe(s)
  })

  test("does nothing when all loaded", () => {
    const s = state({ loadingMore: false, loadedCount: 50, documentCount: 50 })
    const result = documentsReducer(s, { type: "LOAD_MORE" })!
    expect(result.loadingMore).toBe(false)
  })

  test("sets loadingMore when more docs exist", () => {
    const s = state({ loadingMore: false, loadedCount: 10, documentCount: 50 })
    const result = documentsReducer(s, { type: "LOAD_MORE" })!
    expect(result.loadingMore).toBe(true)
  })
})

describe("MOVE_COLUMN", () => {
  const cols = [
    { field: "a", frequency: 1, visible: true, displayMode: "normal" as const },
    { field: "b", frequency: 1, visible: true, displayMode: "normal" as const },
    { field: "c", frequency: 1, visible: false, displayMode: "normal" as const },
  ]

  test("clamps to 0", () => {
    const s = state({ columns: cols, selectedColumnIndex: 0 })
    const result = documentsReducer(s, { type: "MOVE_COLUMN", delta: -1 })!
    expect(result.selectedColumnIndex).toBe(0)
  })

  test("clamps to last visible", () => {
    const s = state({ columns: cols, selectedColumnIndex: 1 })
    const result = documentsReducer(s, { type: "MOVE_COLUMN", delta: 1 })!
    expect(result.selectedColumnIndex).toBe(1) // only 2 visible
  })
})
