import { describe, expect, test } from "bun:test"
import { initPicker, pickerReducer, type PickerAction } from "./columnPickerReducer"

const rows = [
  { path: "_id", depth: 0, type: "objectid" },
  { path: "name", depth: 0, type: "string" },
  { path: "address", depth: 0, type: "object" },
  { path: "address.city", depth: 1, type: "string" },
]
const defaults = ["_id", "name", "address"]
const run = (...actions: PickerAction[]) =>
  actions.reduce(pickerReducer, initPicker(rows, defaults, defaults))

describe("pickerReducer", () => {
  test("keys in one batch act on each other's result", () => {
    expect(run({ type: "move", delta: 1 }, { type: "toggle" }).checked).toEqual(["_id", "address"])
  })

  test("toggle acts on the filtered row under the cursor", () => {
    const state = run({ type: "query", edit: () => "city" }, { type: "toggle" })

    expect(state.checked).toEqual(["_id", "name", "address.city"])
  })

  test("typing resets the cursor; moves clamp to the visible rows", () => {
    const state = run({ type: "move", delta: 3 }, { type: "query", edit: () => "na" })

    expect(state.cursor).toBe(0)
    expect(pickerReducer(state, { type: "move", delta: 5 }).cursor).toBe(0)
  })

  test("reset restores the defaults", () => {
    expect(run({ type: "toggle" }, { type: "reset" }).checked).toEqual(defaults)
  })
})

describe("hide-all", () => {
  test("hides only the filtered rows", () => {
    const state = run({ type: "query", edit: () => "name" }, { type: "hide-all" })

    expect(state.checked).toEqual(["_id", "address"])
  })

  test("then hand-picked rows become the columns, in pick order", () => {
    const state = run(
      { type: "hide-all" },
      { type: "move", delta: 3 },
      { type: "toggle" },
      { type: "move", delta: -2 },
      { type: "toggle" },
    )

    expect(state.checked).toEqual(["address.city", "name"])
  })

  test("Enter with nothing checked does not apply", () => {
    expect(run({ type: "hide-all" }, { type: "apply" }).applied).toBe(false)
  })
})
