import { describe, test, expect } from "bun:test"
import { pipelineReducer } from "./pipeline"
import { createInitialState } from "../../state"
import type { AppState } from "../../types"

function state(overrides: Partial<AppState> = {}): AppState {
  return { ...createInitialState(), ...overrides }
}

describe("ENTER_PIPELINE_MODE", () => {
  test("converts simple query to pipeline stages", () => {
    const s = state({ queryInput: "status:active", sortField: "name", sortDirection: 1 })
    const result = pipelineReducer(s, { type: "ENTER_PIPELINE_MODE" })!
    expect(result.pipelineMode).toBe(true)
    expect(result.pipeline.length).toBeGreaterThanOrEqual(2)
    // First stage should be $match
    expect(result.pipeline[0]).toHaveProperty("$match")
    expect(result.pipeline[0].$match).toHaveProperty("status")
    // Second stage should be $sort
    expect(result.pipeline[1]).toEqual({ $sort: { name: 1 } })
  })

  test("includes $match even with empty query", () => {
    const s = state({ queryInput: "" })
    const result = pipelineReducer(s, { type: "ENTER_PIPELINE_MODE" })!
    expect(result.pipeline[0]).toHaveProperty("$match")
    expect(result.pipeline[0].$match).toEqual({})
  })

  test("does not trigger reload (same data)", () => {
    const s = state({ reloadCounter: 5 })
    const result = pipelineReducer(s, { type: "ENTER_PIPELINE_MODE" })!
    expect(result.reloadCounter).toBe(5)
    expect(result.documentsLoading).toBeFalsy()
  })
})

describe("ADD_PIPELINE_MATCH_CONDITION", () => {
  test("adds field to existing $match", () => {
    const s = state({
      pipelineMode: true,
      pipeline: [{ $match: { status: "active" } }],
    })
    const result = pipelineReducer(s, {
      type: "ADD_PIPELINE_MATCH_CONDITION",
      field: "age",
      value: 25,
    })!
    expect(result.pipeline[0].$match).toEqual({ status: "active", age: 25 })
    expect(result.documentsLoading).toBe(true)
  })

  test("overwrites existing field in $match", () => {
    const s = state({
      pipelineMode: true,
      pipeline: [{ $match: { status: "active" } }],
    })
    const result = pipelineReducer(s, {
      type: "ADD_PIPELINE_MATCH_CONDITION",
      field: "status",
      value: "inactive",
    })!
    expect(result.pipeline[0].$match).toEqual({ status: "inactive" })
  })

  test("returns state unchanged if no $match stage", () => {
    const s = state({
      pipelineMode: true,
      pipeline: [{ $group: { _id: "$status" } }],
    })
    const result = pipelineReducer(s, {
      type: "ADD_PIPELINE_MATCH_CONDITION",
      field: "age",
      value: 25,
    })!
    expect(result).toBe(s)
  })

  test("regenerates pipelineSource", () => {
    const s = state({
      pipelineMode: true,
      pipeline: [{ $match: {} }],
      pipelineSource: "",
    })
    const result = pipelineReducer(s, {
      type: "ADD_PIPELINE_MATCH_CONDITION",
      field: "name",
      value: "Alice",
    })!
    expect(result.pipelineSource).toContain('"name"')
    expect(result.pipelineSource).toContain('"Alice"')
  })
})

describe("SET_PIPELINE", () => {
  test("activates pipeline mode and triggers reload", () => {
    const s = state({ reloadCounter: 0 })
    const result = pipelineReducer(s, {
      type: "SET_PIPELINE",
      pipeline: [{ $match: {} }],
      source: "[{}]",
      isAggregate: false,
    })!
    expect(result.pipelineMode).toBe(true)
    expect(result.documentsLoading).toBe(true)
    expect(result.reloadCounter).toBe(1)
    expect(result.queryInput).toBe("")
  })
})

describe("CLEAR_PIPELINE", () => {
  test("resets to simple mode", () => {
    const s = state({
      pipelineMode: true,
      pipeline: [{ $match: {} }],
      pipelineWatching: true,
      reloadCounter: 5,
    })
    const result = pipelineReducer(s, { type: "CLEAR_PIPELINE" })!
    expect(result.pipelineMode).toBe(false)
    expect(result.pipeline).toEqual([])
    expect(result.pipelineWatching).toBe(false)
    expect(result.queryMode).toBe("simple")
    expect(result.reloadCounter).toBe(6)
  })
})
