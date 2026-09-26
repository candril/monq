import { describe, expect, test } from "bun:test"
import { projectionColumns, replaceProjectionTokens } from "./projection"

describe("projectionColumns", () => {
  test("inclusion paths become columns in token order, _id first", () => {
    expect(projectionColumns({ Status: 1, "TvContract.Username": 1 })).toEqual([
      "_id",
      "Status",
      "TvContract.Username",
    ])
  })

  test("keeps _id in the list when it is excluded", () => {
    expect(projectionColumns({ _id: 0, name: 1 })).toEqual(["_id", "name"])
  })

  test("exclusion projection → null", () => {
    expect(projectionColumns({ secret: 0 })).toBeNull()
    expect(projectionColumns({ _id: 0 })).toBeNull()
  })

  test("computed $project fields → null", () => {
    expect(projectionColumns({ name: 1, city: "$address.city" })).toBeNull()
  })

  test("no projection → null", () => {
    expect(projectionColumns(undefined)).toBeNull()
  })
})

describe("replaceProjectionTokens", () => {
  test("keeps filters and search terms, swaps projection tokens", () => {
    expect(replaceProjectionTokens('status:active "new york" +a -status:x -b', { c: 1 })).toBe(
      'status:active "new york" -status:x +c',
    )
  })

  test("empty projection removes every projection token", () => {
    expect(replaceProjectionTokens("alice +a +b", {})).toBe("alice")
  })
})
