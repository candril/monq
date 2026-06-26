import { describe, test, expect } from "bun:test"
import { Long, Int32, Double } from "bson"
import { ObjectId } from "mongodb"
import { stableEjson, sameByValue, sameCanonical } from "./docCompare"

describe("sameByValue (relaxed — ignores numeric BSON type)", () => {
  test("a plain number equals the same value as Long/Int32/Double", () => {
    expect(sameByValue({ n: 5 }, { n: Long.fromNumber(5) })).toBe(true)
    expect(sameByValue({ n: 5 }, { n: new Int32(5) })).toBe(true)
    expect(sameByValue({ n: 5 }, { n: new Double(5) })).toBe(true)
  })

  test("different values are not equal", () => {
    expect(sameByValue({ n: 5 }, { n: 6 })).toBe(false)
  })

  test("key order does not matter", () => {
    expect(sameByValue({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
  })

  test("nested key order does not matter", () => {
    expect(sameByValue({ x: { a: 1, b: 2 } }, { x: { b: 2, a: 1 } })).toBe(true)
  })

  test("ObjectId and Date compare by value", () => {
    const id = new ObjectId()
    const when = new Date("2024-01-01T00:00:00Z")
    expect(
      sameByValue(
        { _id: id, at: when },
        { _id: new ObjectId(id.toHexString()), at: new Date(when) },
      ),
    ).toBe(true)
  })
})

describe("sameCanonical (exact — includes numeric BSON type)", () => {
  test("a plain number is NOT canonically equal to a Long of the same value", () => {
    expect(sameCanonical({ n: 5 }, { n: Long.fromNumber(5) })).toBe(false)
  })

  test("same type and value is canonically equal", () => {
    expect(sameCanonical({ n: Long.fromNumber(5) }, { n: Long.fromNumber(5) })).toBe(true)
  })

  test("Int32 and Double of the same value differ canonically", () => {
    expect(sameCanonical({ n: new Int32(5) }, { n: new Double(5) })).toBe(false)
  })
})

describe("stableEjson", () => {
  test("is stable across key order", () => {
    expect(stableEjson({ a: 1, b: 2 }, { relaxed: true })).toBe(
      stableEjson({ b: 2, a: 1 }, { relaxed: true }),
    )
  })
})
