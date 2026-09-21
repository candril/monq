import { describe, test, expect } from "bun:test"
import { ObjectId } from "mongodb"
import { toggleIdAsDate } from "./idAsDate"
import { createInitialState } from "../state"
import type { AppState } from "../types"
import type { AppAction } from "../state"

function run(overrides: Partial<AppState>): AppAction[] {
  const dispatched: AppAction[] = []
  toggleIdAsDate({ ...createInitialState(), ...overrides }, (a) => dispatched.push(a))
  return dispatched
}

describe("toggleIdAsDate", () => {
  test("turns on when a loaded document has an ObjectId _id", () => {
    const dispatched = run({ documents: [{ _id: "slug" }, { _id: new ObjectId() }] })

    expect(dispatched.map((a) => a.type)).toEqual(["TOGGLE_ID_AS_DATE", "SHOW_MESSAGE"])
  })

  test("warns and stays off when no _id is an ObjectId", () => {
    const dispatched = run({ documents: [{ _id: "slug" }, { _id: 42 }] })

    expect(dispatched).toEqual([
      {
        type: "SHOW_MESSAGE",
        message: "_id is not an ObjectId — no creation date to show",
        kind: "warning",
      },
    ])
  })

  test("always turns off, even without ObjectIds loaded", () => {
    const dispatched = run({ idAsDate: true, documents: [{ _id: "slug" }] })

    expect(dispatched[0]).toEqual({ type: "TOGGLE_ID_AS_DATE" })
  })
})
