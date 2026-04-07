import { describe, test, expect, mock } from "bun:test"
import { ObjectId } from "mongodb"
import { filterBySelectedValue } from "./filterValue"
import { createInitialState } from "../state"
import type { AppState } from "../types"
import type { AppAction } from "../state"

function state(overrides: Partial<AppState> = {}): AppState {
  return { ...createInitialState(), ...overrides }
}

describe("filterBySelectedValue — pipeline mode", () => {
  test("ObjectId value dispatches ADD_PIPELINE_MATCH_CONDITION, not a warning", () => {
    // regression: ObjectId was excluded from isSimpleValue and triggered
    // "complex value" warning instead of adding to $match
    const id = new ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa")
    const dispatched: AppAction[] = []
    const dispatch = mock((a: AppAction) => dispatched.push(a))

    const s = state({
      pipelineMode: true,
      pipeline: [{ $match: {} }],
      documents: [{ _id: id }],
      selectedIndex: 0,
      selectedColumnIndex: 0,
      columns: [{ field: "_id", visible: true, frequency: 1, displayMode: "normal" }],
    })

    filterBySelectedValue(s, dispatch)

    expect(dispatched).toHaveLength(1)
    expect(dispatched[0].type).toBe("ADD_PIPELINE_MATCH_CONDITION")
    const action = dispatched[0] as Extract<AppAction, { type: "ADD_PIPELINE_MATCH_CONDITION" }>
    expect(action.field).toBe("_id")
    expect(action.value).toBeInstanceOf(ObjectId)
    expect((action.value as ObjectId).toHexString()).toBe("aaaaaaaaaaaaaaaaaaaaaaaa")
  })

  test("ObjectId value does NOT dispatch SHOW_MESSAGE warning", () => {
    const id = new ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb")
    const dispatched: AppAction[] = []
    const dispatch = mock((a: AppAction) => dispatched.push(a))

    const s = state({
      pipelineMode: true,
      pipeline: [{ $match: {} }],
      documents: [{ _id: id }],
      selectedIndex: 0,
      selectedColumnIndex: 0,
      columns: [{ field: "_id", visible: true, frequency: 1, displayMode: "normal" }],
    })

    filterBySelectedValue(s, dispatch)

    const warnings = dispatched.filter((a) => a.type === "SHOW_MESSAGE")
    expect(warnings).toHaveLength(0)
  })

  test("string value still works", () => {
    const dispatched: AppAction[] = []
    const dispatch = mock((a: AppAction) => dispatched.push(a))

    const s = state({
      pipelineMode: true,
      pipeline: [{ $match: {} }],
      documents: [{ status: "active" }],
      selectedIndex: 0,
      selectedColumnIndex: 0,
      columns: [{ field: "status", visible: true, frequency: 1, displayMode: "normal" }],
    })

    filterBySelectedValue(s, dispatch)

    expect(dispatched[0].type).toBe("ADD_PIPELINE_MATCH_CONDITION")
    const action = dispatched[0] as Extract<AppAction, { type: "ADD_PIPELINE_MATCH_CONDITION" }>
    expect(action.value).toBe("active")
  })

  test("plain object value still shows warning (complex type)", () => {
    const dispatched: AppAction[] = []
    const dispatch = mock((a: AppAction) => dispatched.push(a))

    const s = state({
      pipelineMode: true,
      pipeline: [{ $match: {} }],
      documents: [{ address: { city: "Zurich" } }],
      selectedIndex: 0,
      selectedColumnIndex: 0,
      columns: [{ field: "address", visible: true, frequency: 1, displayMode: "normal" }],
    })

    filterBySelectedValue(s, dispatch)

    expect(dispatched[0].type).toBe("SHOW_MESSAGE")
  })
})

describe("filterBySelectedValue — simple mode", () => {
  test("ObjectId value produces ObjectId(...) token", () => {
    const id = new ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa")
    const dispatched: AppAction[] = []
    const dispatch = mock((a: AppAction) => dispatched.push(a))

    const s = state({
      pipelineMode: false,
      queryInput: "",
      documents: [{ _id: id }],
      selectedIndex: 0,
      selectedColumnIndex: 0,
      columns: [{ field: "_id", visible: true, frequency: 1, displayMode: "normal" }],
    })

    filterBySelectedValue(s, dispatch)

    const setQuery = dispatched.find((a) => a.type === "SET_QUERY_INPUT") as Extract<
      AppAction,
      { type: "SET_QUERY_INPUT" }
    >
    expect(setQuery).toBeDefined()
    expect(setQuery.input).toBe("_id:ObjectId(aaaaaaaaaaaaaaaaaaaaaaaa)")
  })
})
