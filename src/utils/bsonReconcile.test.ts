import { describe, test, expect } from "bun:test"
import { EJSON, Long, Int32, Double, Decimal128 } from "bson"
import { ObjectId } from "mongodb"
import { reconcileTypes, reconcileDocument } from "./bsonReconcile"
import { serializeForEdit } from "./document"

/** Simulate the editor round-trip: relaxed EJSON -> parse -> deserialize. */
function roundTrip(doc: Record<string, unknown>): Record<string, unknown> {
  const text = serializeForEdit(doc)
  return EJSON.deserialize(JSON.parse(text)) as Record<string, unknown>
}

function bsonOf(value: unknown): string | undefined {
  return value !== null && typeof value === "object" && "_bsontype" in value
    ? (value as { _bsontype: string })._bsontype
    : undefined
}

describe("reconcileTypes — Long", () => {
  test("untouched Long(5) is restored as Long, not Int32", () => {
    // arrange
    const original = { count: Long.fromNumber(5) }
    const edited = { count: 5 } // relaxed EJSON collapsed Long -> number

    // act
    const result = reconcileTypes(edited, original) as { count: unknown }

    // assert
    expect(bsonOf(result.count)).toBe("Long")
    expect((result.count as Long).toNumber()).toBe(5)
  })

  test("untouched big Long keeps exact value beyond 2^53", () => {
    // arrange
    const big = Long.fromString("9007199254740993")
    const original = { id: big }
    // relaxed serialization is lossy (...992); reconcile must restore the original
    const edited = roundTrip(original)

    // act
    const result = reconcileTypes(edited, original) as { id: unknown }

    // assert
    expect(bsonOf(result.id)).toBe("Long")
    expect((result.id as Long).toString()).toBe("9007199254740993")
  })

  test("changed Long stays Long with the new integer value", () => {
    const original = { count: Long.fromNumber(5) }
    const edited = { count: 42 }

    const result = reconcileTypes(edited, original) as { count: unknown }

    expect(bsonOf(result.count)).toBe("Long")
    expect((result.count as Long).toNumber()).toBe(42)
  })

  test("Long changed to a fractional value becomes Double (cannot be Long)", () => {
    const original = { count: Long.fromNumber(5) }
    const edited = { count: 2.5 }

    const result = reconcileTypes(edited, original) as { count: unknown }

    expect(bsonOf(result.count)).toBe("Double")
    expect((result.count as Double).valueOf()).toBe(2.5)
  })
})

describe("reconcileTypes — Int32", () => {
  test("untouched Int32 stays Int32", () => {
    const original = { n: new Int32(7) }
    const edited = { n: 7 }

    const result = reconcileTypes(edited, original) as { n: unknown }

    expect(bsonOf(result.n)).toBe("Int32")
    expect((result.n as Int32).valueOf()).toBe(7)
  })

  test("changed Int32 stays Int32", () => {
    const original = { n: new Int32(7) }
    const edited = { n: 9 }

    const result = reconcileTypes(edited, original) as { n: unknown }

    expect(bsonOf(result.n)).toBe("Int32")
    expect((result.n as Int32).valueOf()).toBe(9)
  })

  test("Int32 changed to a fractional value becomes Double", () => {
    const original = { n: new Int32(7) }
    const edited = { n: 1.5 }

    const result = reconcileTypes(edited, original) as { n: unknown }

    expect(bsonOf(result.n)).toBe("Double")
  })
})

describe("reconcileTypes — Double", () => {
  test("integer-valued Double stays Double, not Int32", () => {
    const original = { d: new Double(5) }
    const edited = { d: 5 }

    const result = reconcileTypes(edited, original) as { d: unknown }

    expect(bsonOf(result.d)).toBe("Double")
    expect((result.d as Double).valueOf()).toBe(5)
  })

  test("fractional Double stays Double", () => {
    const original = { d: new Double(2.5) }
    const edited = { d: 3.75 }

    const result = reconcileTypes(edited, original) as { d: unknown }

    expect(bsonOf(result.d)).toBe("Double")
    expect((result.d as Double).valueOf()).toBe(3.75)
  })
})

describe("reconcileTypes — Decimal128", () => {
  test("plain number against Decimal128 original is re-typed to Decimal128", () => {
    const original = { price: Decimal128.fromString("1.50") }
    const edited = { price: 2 } // hypothetical: user typed a bare number

    const result = reconcileTypes(edited, original) as { price: unknown }

    expect(bsonOf(result.price)).toBe("Decimal128")
    expect((result.price as Decimal128).toString()).toBe("2")
  })

  test("Decimal128 survives the real editor round-trip untouched", () => {
    const original = { price: Decimal128.fromString("1.50") }
    const edited = roundTrip(original) // relaxed keeps $numberDecimal -> Decimal128

    const result = reconcileTypes(edited, original) as { price: unknown }

    expect(bsonOf(result.price)).toBe("Decimal128")
    expect((result.price as Decimal128).toString()).toBe("1.50")
  })
})

describe("reconcileTypes — explicit user EJSON wins", () => {
  test("edited Long wrapper is honored over an Int32 original", () => {
    // user wrote { "$numberLong": "5" } in the editor, original was Int32
    const original = { n: new Int32(5) }
    const edited = { n: Long.fromNumber(5) }

    const result = reconcileTypes(edited, original) as { n: unknown }

    expect(bsonOf(result.n)).toBe("Long")
  })
})

describe("reconcileTypes — nested structures", () => {
  test("nested object numbers are reconciled recursively", () => {
    const original = { meta: { count: Long.fromNumber(1), tag: "x" } }
    const edited = { meta: { count: 1, tag: "x" } }

    const result = reconcileTypes(edited, original) as { meta: { count: unknown } }

    expect(bsonOf(result.meta.count)).toBe("Long")
  })

  test("arrays of numbers are reconciled element-wise", () => {
    const original = { scores: [Long.fromNumber(1), Long.fromNumber(2)] }
    const edited = { scores: [1, 2] }

    const result = reconcileTypes(edited, original) as { scores: unknown[] }

    expect(bsonOf(result.scores[0])).toBe("Long")
    expect(bsonOf(result.scores[1])).toBe("Long")
  })

  test("array element changed value keeps its Long type", () => {
    const original = { scores: [Long.fromNumber(1), Long.fromNumber(2)] }
    const edited = { scores: [1, 99] }

    const result = reconcileTypes(edited, original) as { scores: unknown[] }

    expect((result.scores[1] as Long).toNumber()).toBe(99)
    expect(bsonOf(result.scores[1])).toBe("Long")
  })

  test("a newly appended element adopts the array's homogeneous numeric type", () => {
    const original = { scores: [Long.fromNumber(1)] }
    const edited = { scores: [1, 2] }

    const result = reconcileTypes(edited, original) as { scores: unknown[] }

    expect(bsonOf(result.scores[0])).toBe("Long")
    expect(bsonOf(result.scores[1])).toBe("Long")
    expect((result.scores[1] as Long).toNumber()).toBe(2)
  })
})

describe("reconcileTypes — array hardening (reorder / heterogeneous)", () => {
  test("reordered element of a homogeneous Long array keeps Long even past a non-numeric slot", () => {
    // original mixes a Long and a string; the user reorders them
    const original = { arr: [Long.fromNumber(1), "tag"] }
    const edited = { arr: ["tag", 1] }

    const result = reconcileTypes(edited, original) as { arr: unknown[] }

    expect(result.arr[0]).toBe("tag")
    // positional original for index 1 is "tag" (non-numeric); fallback = the array's
    // single numeric type (Long)
    expect(bsonOf(result.arr[1])).toBe("Long")
    expect((result.arr[1] as Long).toNumber()).toBe(1)
  })

  test("inserting at the front of a homogeneous Long array keeps every element Long", () => {
    const original = { ids: [Long.fromNumber(10), Long.fromNumber(20)] }
    const edited = { ids: [5, 10, 20] } // user prepended 5

    const result = reconcileTypes(edited, original) as { ids: unknown[] }

    expect(result.ids.map(bsonOf)).toEqual(["Long", "Long", "Long"])
  })

  test("mixed-type numeric array has no safe fallback (positional only)", () => {
    // No dominant type, so we fall back to positional matching only.
    const original = { vals: [Long.fromNumber(1), new Int32(2)] }
    const edited = { vals: [1, 2] } // not reordered — positional still correct

    const result = reconcileTypes(edited, original) as { vals: unknown[] }

    expect(bsonOf(result.vals[0])).toBe("Long")
    expect(bsonOf(result.vals[1])).toBe("Int32")
  })
})

describe("reconcileTypes — values left untouched", () => {
  test("a new field absent from the original keeps its plain number", () => {
    const original = { a: Long.fromNumber(1) }
    const edited = { a: 1, brandNew: 7 }

    const result = reconcileTypes(edited, original) as { brandNew: unknown }

    expect(result.brandNew).toBe(7)
    expect(typeof result.brandNew).toBe("number")
  })

  test("a number replacing a non-numeric original is left as-is", () => {
    // user deliberately changed a string field to a number
    const original = { v: "hello" }
    const edited = { v: 5 }

    const result = reconcileTypes(edited, original) as { v: unknown }

    expect(result.v).toBe(5)
  })

  test("strings, booleans and null pass through unchanged", () => {
    const original = { s: "a", b: true, n: null }
    const edited = { s: "b", b: false, n: null }

    const result = reconcileTypes(edited, original) as Record<string, unknown>

    expect(result.s).toBe("b")
    expect(result.b).toBe(false)
    expect(result.n).toBeNull()
  })

  test("ObjectId and Date pass through unchanged", () => {
    const id = new ObjectId()
    const when = new Date("2024-01-01T00:00:00Z")
    const original = { _id: id, at: when }
    const edited = { _id: id, at: when }

    const result = reconcileTypes(edited, original) as { _id: unknown; at: unknown }

    expect((result._id as ObjectId).toHexString()).toBe(id.toHexString())
    expect((result.at as Date).toISOString()).toBe(when.toISOString())
  })

  test("a number against a missing/undefined original is left as-is", () => {
    const result = reconcileTypes({ x: 5 }, undefined) as { x: unknown }
    expect(result.x).toBe(5)
  })
})

describe("reconcileDocument — full editor round-trip", () => {
  test("preserves every numeric BSON type through serialize -> parse -> reconcile", () => {
    // arrange
    const original = {
      _id: new ObjectId(),
      asLong: Long.fromNumber(5),
      asBigLong: Long.fromString("9007199254740993"),
      asInt32: new Int32(7),
      asDouble: new Double(2),
      asDecimal: Decimal128.fromString("9.99"),
      name: "Alice",
      when: new Date("2024-06-01T00:00:00Z"),
    }

    // act — simulate editing without changing anything
    const edited = roundTrip(original)
    const result = reconcileDocument(edited, original)

    // assert — types preserved
    expect(bsonOf(result.asLong)).toBe("Long")
    expect(bsonOf(result.asBigLong)).toBe("Long")
    expect((result.asBigLong as Long).toString()).toBe("9007199254740993")
    expect(bsonOf(result.asInt32)).toBe("Int32")
    expect(bsonOf(result.asDouble)).toBe("Double")
    expect(bsonOf(result.asDecimal)).toBe("Decimal128")
    expect(result.name).toBe("Alice")
    expect((result.when as Date).toISOString()).toBe("2024-06-01T00:00:00.000Z")
  })

  test("an unchanged document is canonically identical after reconcile (no false diff)", () => {
    const original = { _id: new ObjectId(), count: Long.fromNumber(5), n: new Int32(1) }

    const edited = roundTrip(original)
    const result = reconcileDocument(edited, original)

    expect(EJSON.stringify(result, undefined, 0, { relaxed: false })).toBe(
      EJSON.stringify(original, undefined, 0, { relaxed: false }),
    )
  })

  test("changing one field does not alter the BSON type of untouched fields", () => {
    const original = { _id: new ObjectId(), count: Long.fromNumber(5), label: "old" }

    const edited = roundTrip(original)
    edited.label = "new"
    const result = reconcileDocument(edited, original)

    expect(result.label).toBe("new")
    expect(bsonOf(result.count)).toBe("Long") // the bug: this used to become Int32
  })
})
