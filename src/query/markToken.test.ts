import { describe, test, expect } from "bun:test"
import { ObjectId } from "mongodb"
import { EJSON } from "bson"
import {
  toggleMarkToken,
  removeAnyMarkToken,
  mergeMarkIntoBson,
  removeIdFromBson,
  mergeMarkIntoPipeline,
  removeIdFromPipeline,
} from "./markToken"

describe("toggleMarkToken", () => {
  test("adds @<letter> to an empty query", () => {
    expect(toggleMarkToken("", "a")).toBe("@a")
  })

  test("appends @<letter> when not present", () => {
    expect(toggleMarkToken("Author:Peter", "a")).toBe("Author:Peter @a")
  })

  test("removes @<letter> when already present", () => {
    expect(toggleMarkToken("Author:Peter @a", "a")).toBe("Author:Peter")
  })

  test("removes @<letter> from middle of query", () => {
    expect(toggleMarkToken("Author:Peter @a Status:Open", "a")).toBe("Author:Peter Status:Open")
  })

  test("different letter is appended, not toggled", () => {
    // Two letters at once is fine; the parser will resolve last-write-wins.
    expect(toggleMarkToken("Author:Peter @a", "b")).toBe("Author:Peter @a @b")
  })

  test("collapses extra whitespace after removal", () => {
    expect(toggleMarkToken("@a Author:Peter", "a")).toBe("Author:Peter")
  })
})

describe("removeAnyMarkToken", () => {
  test("strips a single @<letter>", () => {
    expect(removeAnyMarkToken("Author:Peter @a")).toBe("Author:Peter")
  })

  test("strips multiple @<letter> tokens", () => {
    expect(removeAnyMarkToken("@a Author:Peter @b")).toBe("Author:Peter")
  })

  test("noop on a query with no marks", () => {
    expect(removeAnyMarkToken("Author:Peter Status:Open")).toBe("Author:Peter Status:Open")
  })

  test("empty query stays empty", () => {
    expect(removeAnyMarkToken("")).toBe("")
  })

  test("does not strip a real `marks:foo` field token", () => {
    // The @-prefix means we never collide with field tokens — sanity check.
    expect(removeAnyMarkToken("marks:active Author:Peter")).toBe("marks:active Author:Peter")
  })
})

describe("mergeMarkIntoBson", () => {
  const oid1 = new ObjectId("507f1f77bcf86cd799439011")
  const oid2 = new ObjectId("507f1f77bcf86cd799439012")

  // Parse the helper output back through EJSON so ObjectIds round-trip
  // to real instances we can compare via toHexString.
  function parsed(s: string | null): Record<string, unknown> {
    return EJSON.parse(s!) as Record<string, unknown>
  }

  test("starts fresh from an empty filter", () => {
    const result = mergeMarkIntoBson("", [oid1, oid2])
    const obj = parsed(result) as { _id: { $in: ObjectId[] } }
    expect(obj._id.$in.map((o) => o.toHexString())).toEqual([
      oid1.toHexString(),
      oid2.toHexString(),
    ])
  })

  test("starts fresh from `{}`", () => {
    const result = mergeMarkIntoBson("{}", [oid1])
    const obj = parsed(result) as { _id: { $in: ObjectId[] } }
    expect(obj._id.$in[0].toHexString()).toBe(oid1.toHexString())
  })

  test("merges into an existing filter, preserving other keys", () => {
    const input = EJSON.stringify({ Author: "Peter" } as never)
    const result = mergeMarkIntoBson(input, [oid1])
    const obj = parsed(result) as { Author: string; _id: { $in: ObjectId[] } }
    expect(obj.Author).toBe("Peter")
    expect(obj._id.$in[0].toHexString()).toBe(oid1.toHexString())
  })

  test("overwrites an existing _id key (last-write-wins)", () => {
    const input = EJSON.stringify({ _id: "previous", Author: "Peter" } as never)
    const result = mergeMarkIntoBson(input, [oid1])
    const obj = parsed(result) as { _id: { $in: ObjectId[] }; Author: string }
    expect(obj._id.$in[0].toHexString()).toBe(oid1.toHexString())
    expect(obj.Author).toBe("Peter")
  })

  test("returns null on invalid JSON (caller decides what to do)", () => {
    expect(mergeMarkIntoBson("{not valid", [oid1])).toBeNull()
  })

  test("returns null when the filter is a JSON array (not an object)", () => {
    expect(mergeMarkIntoBson("[1,2,3]", [oid1])).toBeNull()
  })
})

describe("removeIdFromBson", () => {
  test("strips _id from an object filter", () => {
    const input = EJSON.stringify({ _id: "x", Author: "Peter" } as never)
    const result = removeIdFromBson(input)
    const parsed = EJSON.parse(result!) as Record<string, unknown>
    expect(parsed).toEqual({ Author: "Peter" } as never)
  })

  test("returns empty string when only _id was present", () => {
    const input = EJSON.stringify({ _id: "x" } as never)
    expect(removeIdFromBson(input)).toBe("")
  })

  test("noop when _id is absent", () => {
    const input = EJSON.stringify({ Author: "Peter" } as never)
    expect(removeIdFromBson(input)).toBe(input)
  })

  test("returns null on invalid JSON", () => {
    expect(removeIdFromBson("{broken")).toBeNull()
  })

  test("empty input stays empty", () => {
    expect(removeIdFromBson("")).toBe("")
  })
})

describe("mergeMarkIntoPipeline", () => {
  const oid1 = new ObjectId("507f1f77bcf86cd799439011")

  test("prepends a $match stage when none exists", () => {
    const result = mergeMarkIntoPipeline([{ $sort: { _id: -1 } }], [oid1])
    expect(result).toEqual([{ $match: { _id: { $in: [oid1] } } }, { $sort: { _id: -1 } }])
  })

  test("merges into the first $match stage", () => {
    const input = [{ $match: { Author: "Peter" } }, { $sort: { _id: -1 } }]
    const result = mergeMarkIntoPipeline(input, [oid1])
    expect(result).toEqual([
      { $match: { Author: "Peter", _id: { $in: [oid1] } } },
      { $sort: { _id: -1 } },
    ])
  })

  test("overwrites an existing _id in $match", () => {
    const input = [{ $match: { _id: "previous", Author: "Peter" } }]
    const result = mergeMarkIntoPipeline(input, [oid1])
    expect(result).toEqual([{ $match: { _id: { $in: [oid1] }, Author: "Peter" } }])
  })

  test("does not mutate the input pipeline", () => {
    const input = [{ $match: { Author: "Peter" } }]
    mergeMarkIntoPipeline(input, [oid1])
    expect(input).toEqual([{ $match: { Author: "Peter" } }])
  })

  test("only touches the first $match stage if there are several", () => {
    const input = [{ $match: { Author: "Peter" } }, { $unwind: "$tags" }, { $match: { tag: "x" } }]
    const result = mergeMarkIntoPipeline(input, [oid1])
    expect(result).toEqual([
      { $match: { Author: "Peter", _id: { $in: [oid1] } } },
      { $unwind: "$tags" },
      { $match: { tag: "x" } },
    ])
  })
})

describe("removeIdFromPipeline", () => {
  const oid1 = new ObjectId("507f1f77bcf86cd799439011")

  test("strips _id from the first $match", () => {
    const input = [{ $match: { _id: { $in: [oid1] }, Author: "Peter" } }]
    const result = removeIdFromPipeline(input)
    expect(result).toEqual([{ $match: { Author: "Peter" } }])
  })

  test("removes the whole $match stage when only _id was present", () => {
    const input = [{ $match: { _id: { $in: [oid1] } } }, { $sort: { _id: -1 } }]
    const result = removeIdFromPipeline(input)
    expect(result).toEqual([{ $sort: { _id: -1 } }])
  })

  test("noop when no $match exists", () => {
    const input = [{ $sort: { _id: -1 } }]
    expect(removeIdFromPipeline(input)).toBe(input)
  })

  test("noop when $match has no _id", () => {
    const input = [{ $match: { Author: "Peter" } }]
    expect(removeIdFromPipeline(input)).toBe(input)
  })

  test("does not mutate the input pipeline", () => {
    const input = [{ $match: { _id: "x", Author: "Peter" } }]
    removeIdFromPipeline(input)
    expect(input).toEqual([{ $match: { _id: "x", Author: "Peter" } }])
  })
})
