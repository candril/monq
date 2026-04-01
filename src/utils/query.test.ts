import { describe, test, expect } from "bun:test"
import type { AppState } from "../types"
import { resolveActiveFilter } from "./query"

/** Build a minimal AppState-shaped object for testing */
function mockState(overrides: Partial<AppState>): AppState {
  return {
    pipelineMode: false,
    pipeline: [],
    queryInput: "",
    queryMode: "simple",
    schemaMap: new Map(),
    sortField: null,
    sortDirection: -1,
    bsonSort: "",
    bsonProjection: "",
    ...overrides,
  } as AppState
}

describe("resolveActiveFilter", () => {
  test("returns empty filter when no query", () => {
    const state = mockState({})
    expect(resolveActiveFilter(state)).toEqual({})
  })

  test("returns parsed filter in simple mode", () => {
    const state = mockState({ queryInput: "name:Alice" })
    const filter = resolveActiveFilter(state)
    expect(filter).toHaveProperty("name")
  })

  test("returns $match filter from aggregate pipeline", () => {
    const state = mockState({
      pipelineMode: true,
      pipeline: [
        { $match: { age: { $gt: 80 } } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ],
    })
    const filter = resolveActiveFilter(state)
    expect(filter).toEqual({ age: { $gt: 80 } })
  })

  test("returns empty filter from aggregate pipeline without $match", () => {
    const state = mockState({
      pipelineMode: true,
      pipeline: [{ $group: { _id: "$status" } }],
    })
    expect(resolveActiveFilter(state)).toEqual({})
  })

  test("returns filter from find-compatible pipeline", () => {
    const state = mockState({
      pipelineMode: true,
      pipeline: [{ $match: { status: "active" } }, { $sort: { _id: -1 } }],
    })
    const filter = resolveActiveFilter(state)
    expect(filter).toEqual({ status: "active" })
  })
})
