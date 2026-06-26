import { describe, test, expect } from "bun:test"
import { Long } from "bson"
import type { Document } from "mongodb"
import { resolveWritesPure } from "./editMany"

function bsonOf(value: unknown): string | undefined {
  return value !== null && typeof value === "object" && "_bsontype" in value
    ? (value as { _bsontype: string })._bsontype
    : undefined
}

describe("resolveWritesPure", () => {
  test("writes when the stored doc is unchanged, reconciling numeric types", () => {
    // arrange
    const display: Document = { _id: "1", count: 5, label: "a" } // on-screen (promoted)
    const fresh: Document = { _id: "1", count: Long.fromNumber(5), label: "a" } // stored (typed)
    const toReplace = [{ originalId: "1", newDoc: { count: 5, label: "b" } as Document }]

    // act
    const { writes, conflicts } = resolveWritesPure(toReplace, [display], [fresh])

    // assert
    expect(conflicts).toEqual([])
    expect(writes).toHaveLength(1)
    expect((writes[0].newDoc as { label: string }).label).toBe("b")
    expect(bsonOf((writes[0].newDoc as { count: unknown }).count)).toBe("Long")
  })

  test("conflict (no write) when the stored doc changed by value", () => {
    const display: Document = { _id: "1", count: 5, label: "a" }
    const fresh: Document = { _id: "1", count: Long.fromNumber(9), label: "a" } // remote changed 5 -> 9
    const toReplace = [{ originalId: "1", newDoc: { count: 5, label: "b" } as Document }]

    const { writes, conflicts } = resolveWritesPure(toReplace, [display], [fresh])

    expect(writes).toEqual([])
    expect(conflicts).toHaveLength(1)
    expect(conflicts[0]).toContain("1")
    expect(conflicts[0]).toContain("changed")
  })

  test("conflict when the stored doc was deleted remotely", () => {
    const display: Document = { _id: "1", count: 5 }
    const toReplace = [{ originalId: "1", newDoc: { count: 6 } as Document }]

    const { writes, conflicts } = resolveWritesPure(toReplace, [display], []) // no fresh docs

    expect(writes).toEqual([])
    expect(conflicts[0]).toContain("deleted")
  })

  test("a type-only remote change (same value) is not a conflict", () => {
    const display: Document = { _id: "1", count: 5 } // was Int32-ish on screen
    const fresh: Document = { _id: "1", count: Long.fromNumber(5) } // now Long, same value
    const toReplace = [{ originalId: "1", newDoc: { count: 5, extra: true } as Document }]

    const { writes, conflicts } = resolveWritesPure(toReplace, [display], [fresh])

    expect(conflicts).toEqual([])
    expect(writes).toHaveLength(1)
    expect(bsonOf((writes[0].newDoc as { count: unknown }).count)).toBe("Long")
  })

  test("mixed batch: unchanged writes, changed and deleted become conflicts", () => {
    const display: Document[] = [
      { _id: "1", v: 1 },
      { _id: "2", v: 2 },
      { _id: "3", v: 3 },
    ]
    const fresh: Document[] = [
      { _id: "1", v: Long.fromNumber(1) }, // unchanged
      { _id: "2", v: Long.fromNumber(99) }, // changed remotely
      // "3" deleted remotely
    ]
    const toReplace = [
      { originalId: "1", newDoc: { v: 1, edited: true } as Document },
      { originalId: "2", newDoc: { v: 2, edited: true } as Document },
      { originalId: "3", newDoc: { v: 3, edited: true } as Document },
    ]

    const { writes, conflicts } = resolveWritesPure(toReplace, display, fresh)

    expect(writes.map((w) => w.originalId)).toEqual(["1"])
    expect(conflicts).toHaveLength(2)
    expect(conflicts.join(" ")).toContain("2")
    expect(conflicts.join(" ")).toContain("3")
  })

  test("empty toReplace yields no writes and no conflicts", () => {
    const { writes, conflicts } = resolveWritesPure([], [], [])
    expect(writes).toEqual([])
    expect(conflicts).toEqual([])
  })
})
