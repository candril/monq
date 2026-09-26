import { describe, expect, test } from "bun:test"
import { buildSchemaMap } from "./schema"
import {
  defaultColumns,
  encodeSelection,
  initialChecked,
  moveChecked,
  pickerRows,
  toggleAll,
  togglePath,
} from "./columnPicker"

const schema = buildSchemaMap([
  { _id: "1", Status: "Active", TvContract: { Username: "a" } },
  { _id: "2", Status: "Ordered", TvContract: { Username: "b", Pin: 1 }, Late: true },
])
const rows = pickerRows(schema, [])
const defaults = defaultColumns(rows)

describe("pickerRows", () => {
  test("_id first, children right under their parent", () => {
    expect(rows.map((r) => r.path)).toEqual([
      "_id",
      "Status",
      "TvContract",
      "TvContract.Username",
      "TvContract.Pin",
      "Late",
    ])
    expect(rows.find((r) => r.path === "TvContract.Pin")?.depth).toBe(1)
  })

  test("includes current columns the schema doesn't know", () => {
    expect(pickerRows(new Map(), ["x"]).map((r) => r.path)).toEqual(["_id", "x"])
  })
})

describe("initialChecked", () => {
  test("no projection → every top-level column", () => {
    expect(initialChecked(undefined, defaults)).toEqual(defaults)
  })

  test("exclusion → all but the excluded", () => {
    expect(initialChecked({ Late: 0 }, defaults)).toEqual(["_id", "Status", "TvContract"])
  })

  test("inclusion → the included paths in order", () => {
    expect(initialChecked({ "TvContract.Username": 1, Status: 1, _id: 0 }, defaults)).toEqual([
      "TvContract.Username",
      "Status",
    ])
  })
})

describe("togglePath", () => {
  test("checking a child drops its parent", () => {
    expect(togglePath(["_id", "TvContract"], "TvContract.Username")).toEqual([
      "_id",
      "TvContract.Username",
    ])
  })

  test("checking a parent drops its children", () => {
    expect(togglePath(["TvContract.Username", "TvContract.Pin"], "TvContract")).toEqual([
      "TvContract",
    ])
  })

  test("unchecks a checked path", () => {
    expect(togglePath(["a", "b"], "a")).toEqual(["b"])
  })
})

describe("toggleAll", () => {
  test("checks every path, later ones winning collisions", () => {
    expect(toggleAll([], ["TvContract", "TvContract.Username"])).toEqual(["TvContract.Username"])
  })

  test("unchecks when all are already checked", () => {
    expect(toggleAll(["a", "b", "c"], ["a", "b"])).toEqual(["c"])
  })
})

describe("moveChecked", () => {
  test("swaps with the neighbour", () => {
    expect(moveChecked(["a", "b", "c"], "c", -1)).toEqual(["a", "c", "b"])
  })

  test("stops at the ends and ignores unchecked paths", () => {
    expect(moveChecked(["a", "b"], "a", -1)).toEqual(["a", "b"])
    expect(moveChecked(["a", "b"], "x", 1)).toEqual(["a", "b"])
  })
})

describe("encodeSelection", () => {
  test("default columns → no projection", () => {
    expect(encodeSelection(defaults, defaults)).toEqual({})
  })

  test("a few top-level columns hidden → exclusions", () => {
    expect(encodeSelection(["_id", "Status", "TvContract"], defaults)).toEqual({ Late: 0 })
  })

  test("nested path → inclusion list in column order", () => {
    expect(encodeSelection(["_id", "Status", "TvContract.Username"], defaults)).toEqual({
      Status: 1,
      "TvContract.Username": 1,
    })
  })

  test("_id unchecked in an inclusion → -_id", () => {
    expect(encodeSelection(["TvContract.Username"], defaults)).toEqual({
      "TvContract.Username": 1,
      _id: 0,
    })
  })

  test("reordered top-level columns → inclusion", () => {
    expect(encodeSelection(["_id", "TvContract", "Status", "Late"], defaults)).toEqual({
      TvContract: 1,
      Status: 1,
      Late: 1,
    })
  })

  test("fewer shown than hidden → inclusion is shorter", () => {
    expect(encodeSelection(["_id", "Status"], defaults)).toEqual({ Status: 1 })
  })
})
