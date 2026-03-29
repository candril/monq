import { describe, test, expect } from "bun:test"
import { ObjectId } from "mongodb"
import { serializeDocument, deserializeDocument, detectColumns } from "./document"

describe("serializeDocument / deserializeDocument", () => {
  test("round-trips a plain document", () => {
    // arrange
    const doc = { _id: new ObjectId(), name: "Alice", age: 30 }

    // act
    const result = deserializeDocument(serializeDocument(doc))

    // assert
    expect(result.name).toBe("Alice")
    expect(result.age).toBe(30)
  })

  test("preserves ObjectId type through round-trip", () => {
    // arrange
    const id = new ObjectId()
    const doc = { _id: id, name: "Alice" }

    // act
    const result = deserializeDocument(serializeDocument(doc))

    // assert
    expect((result._id as ObjectId).toHexString()).toBe(id.toHexString())
  })

  test("preserves Date type through round-trip", () => {
    // arrange
    const now = new Date("2024-01-01T00:00:00Z")
    const doc = { _id: new ObjectId(), createdAt: now }

    // act
    const result = deserializeDocument(serializeDocument(doc))

    // assert
    expect((result.createdAt as Date).toISOString()).toBe(now.toISOString())
  })

  test("preserves nested objects", () => {
    // arrange
    const doc = { _id: new ObjectId(), address: { city: "Berlin", zip: "10115" } }

    // act
    const result = deserializeDocument(serializeDocument(doc))

    // assert
    expect((result.address as Record<string, string>).city).toBe("Berlin")
  })

  test("serialized output is valid JSON", () => {
    // arrange
    const doc = { _id: new ObjectId(), name: "Alice" }

    // act + assert
    expect(() => JSON.parse(serializeDocument(doc))).not.toThrow()
  })
})

describe("detectColumns", () => {
  test("empty array returns empty columns", () => {
    expect(detectColumns([])).toEqual([])
  })

  test("_id is always first", () => {
    // arrange
    const docs = [{ _id: "1", name: "Peter", age: 30 }]

    // act
    const cols = detectColumns(docs)

    // assert
    expect(cols[0]).toBe("_id")
  })

  test("all fields present in small set", () => {
    // arrange
    const docs = [{ _id: "1", name: "Peter", age: 30 }]

    // act
    const cols = detectColumns(docs)

    // assert
    expect(cols).toContain("name")
    expect(cols).toContain("age")
  })

  test("scalar fields before complex fields", () => {
    // arrange
    const docs = [{ _id: "1", name: "Peter", address: { city: "Berlin" }, age: 30 }]

    // act
    const cols = detectColumns(docs)

    // assert
    const nameIdx = cols.indexOf("name")
    const ageIdx = cols.indexOf("age")
    const addrIdx = cols.indexOf("address")
    expect(nameIdx).toBeLessThan(addrIdx)
    expect(ageIdx).toBeLessThan(addrIdx)
  })

  test("fields sorted alphabetically within same complexity", () => {
    // arrange
    const docs = [{ _id: "1", zebra: "z", apple: "a", mango: "m" }]

    // act
    const cols = detectColumns(docs).filter((c) => c !== "_id")

    // assert
    expect(cols).toEqual(["apple", "mango", "zebra"])
  })

  test("sparse fields excluded by threshold in large sets", () => {
    // arrange — 50 docs, one field appears in only 1 doc — should be excluded
    const docs = Array.from({ length: 50 }, (_, i) => ({
      _id: String(i),
      common: "value",
      ...(i === 0 ? { rare: "only once" } : {}),
    }))

    // act
    const cols = detectColumns(docs)

    // assert
    expect(cols).not.toContain("rare")
    expect(cols).toContain("common")
  })

  test("all fields included in small sets regardless of sparseness", () => {
    // arrange
    const docs = [
      { _id: "1", common: "a", sparse: "only here" },
      { _id: "2", common: "b" },
    ]

    // act
    const cols = detectColumns(docs)

    // assert
    expect(cols).toContain("sparse")
  })
})
