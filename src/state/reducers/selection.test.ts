import { describe, test, expect } from "bun:test"
import { ObjectId } from "mongodb"
import { selectionReducer } from "./selection"
import { createInitialState } from "../../state"
import type { AppState } from "../../types"

function state(overrides: Partial<AppState> = {}): AppState {
  return { ...createInitialState(), ...overrides }
}

const docs = [
  { _id: new ObjectId("aaaaaaaaaaaaaaaaaaaaaaaa") },
  { _id: new ObjectId("bbbbbbbbbbbbbbbbbbbbbbbb") },
  { _id: new ObjectId("cccccccccccccccccccccccc") },
  { _id: new ObjectId("dddddddddddddddddddddddd") },
  { _id: new ObjectId("eeeeeeeeeeeeeeeeeeeeeeee") },
]

describe("ENTER_SELECTION_MODE", () => {
  test("selects current document and sets anchor", () => {
    const s = state({ documents: docs, selectedIndex: 2 })
    const result = selectionReducer(s, { type: "ENTER_SELECTION_MODE" })!
    expect(result.selectionMode).toBe("selecting")
    expect(result.selectionAnchor).toBe(2)
    expect(result.selectedIds.size).toBe(1)
    expect(result.selectedRows.has(2)).toBe(true)
  })

  test("noop if already selecting", () => {
    const s = state({ documents: docs, selectionMode: "selecting" })
    expect(selectionReducer(s, { type: "ENTER_SELECTION_MODE" })).toBe(s)
  })
})

describe("MOVE_SELECTION", () => {
  test("extends selection range when selecting", () => {
    const s = state({
      documents: docs,
      selectedIndex: 1,
      selectionMode: "selecting",
      selectionAnchor: 1,
      frozenIds: new Set<string>(),
      selectedIds: new Set([docs[1]._id.toHexString()]),
    })
    const result = selectionReducer(s, { type: "MOVE_SELECTION", delta: 2 })!
    expect(result.selectedIndex).toBe(3)
    // Should include indices 1, 2, 3
    expect(result.selectedRows.has(1)).toBe(true)
    expect(result.selectedRows.has(2)).toBe(true)
    expect(result.selectedRows.has(3)).toBe(true)
    expect(result.selectedIds.size).toBe(3)
  })

  test("moves without selecting when not in selecting mode", () => {
    const s = state({ documents: docs, selectedIndex: 1, selectionMode: "none" })
    const result = selectionReducer(s, { type: "MOVE_SELECTION", delta: 1 })!
    expect(result.selectedIndex).toBe(2)
    expect(result.selectedIds.size).toBe(0)
  })

  test("clamps to bounds", () => {
    const s = state({ documents: docs, selectedIndex: 0, selectionMode: "none" })
    const result = selectionReducer(s, { type: "MOVE_SELECTION", delta: -5 })!
    expect(result.selectedIndex).toBe(0)
  })
})

describe("TOGGLE_CURRENT_ROW", () => {
  test("adds unselected row", () => {
    const s = state({
      documents: docs,
      selectedIndex: 1,
      selectedIds: new Set<string>(),
      frozenIds: new Set<string>(),
    })
    const result = selectionReducer(s, { type: "TOGGLE_CURRENT_ROW" })!
    expect(result.selectedIds.has(docs[1]._id.toHexString())).toBe(true)
    expect(result.selectionMode).toBe("selected")
  })

  test("removes selected row", () => {
    const id = docs[1]._id.toHexString()
    const s = state({
      documents: docs,
      selectedIndex: 1,
      selectionMode: "selected",
      selectedIds: new Set([id]),
      frozenIds: new Set([id]),
    })
    const result = selectionReducer(s, { type: "TOGGLE_CURRENT_ROW" })!
    expect(result.selectedIds.has(id)).toBe(false)
    expect(result.frozenIds.has(id)).toBe(false)
  })
})

describe("SELECT_ALL", () => {
  test("selects all documents", () => {
    const s = state({ documents: docs, selectedIndex: 0 })
    const result = selectionReducer(s, { type: "SELECT_ALL" })!
    expect(result.selectionMode).toBe("selecting")
    expect(result.selectedIds.size).toBe(5)
    expect(result.selectedRows.size).toBe(5)
  })

  test("preserves existing selections", () => {
    const existing = new Set([docs[0]._id.toHexString()])
    const s = state({ documents: docs, selectedIds: existing })
    const result = selectionReducer(s, { type: "SELECT_ALL" })!
    expect(result.selectedIds.size).toBe(5)
  })
})

describe("FREEZE_SELECTION", () => {
  test("transitions from selecting to selected", () => {
    const ids = new Set([docs[0]._id.toHexString(), docs[1]._id.toHexString()])
    const s = state({
      documents: docs,
      selectionMode: "selecting",
      selectedIds: ids,
      selectionAnchor: 0,
    })
    const result = selectionReducer(s, { type: "FREEZE_SELECTION" })!
    expect(result.selectionMode).toBe("selected")
    expect(result.frozenIds.size).toBe(2)
    expect(result.selectionAnchor).toBeNull()
  })

  test("noop if not selecting", () => {
    const s = state({ selectionMode: "none" })
    expect(selectionReducer(s, { type: "FREEZE_SELECTION" })).toBe(s)
  })
})
