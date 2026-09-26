import { describe, test, expect } from "bun:test"
import { ObjectId } from "mongodb"
import { serializeDocument, deserializeDocument, detectColumns, getNestedValue } from "./document"

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

  test("fields follow first-document insertion order", () => {
    // arrange
    const docs = [{ _id: "1", name: "Peter", address: { city: "Berlin" }, age: 30 }]

    // act
    const cols = detectColumns(docs)

    // assert — order matches object key order, with _id first
    expect(cols).toEqual(["_id", "name", "address", "age"])
  })

  test("fields from later documents are appended in discovery order", () => {
    // arrange
    const docs = [
      { _id: "1", zebra: "z", apple: "a" },
      { _id: "2", mango: "m", zebra: "z" },
    ]

    // act
    const cols = detectColumns(docs).filter((c) => c !== "_id")

    // assert — zebra/apple from doc 1, mango appended from doc 2
    expect(cols).toEqual(["zebra", "apple", "mango"])
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

describe("getNestedValue", () => {
  const doc = {
    name: "Peter",
    address: {
      city: "Berlin",
      zip: { code: "10115" },
    },
    tags: ["a", "b"],
  }

  test("top-level field", () => {
    expect(getNestedValue(doc, "name")).toBe("Peter")
  })

  test("nested field", () => {
    expect(getNestedValue(doc, "address.city")).toBe("Berlin")
  })

  test("deeply nested field", () => {
    expect(getNestedValue(doc, "address.zip.code")).toBe("10115")
  })

  test("missing field returns undefined", () => {
    expect(getNestedValue(doc, "email")).toBeUndefined()
  })

  test("missing nested field returns undefined", () => {
    expect(getNestedValue(doc, "address.country")).toBeUndefined()
  })

  test("path through non-object returns undefined", () => {
    expect(getNestedValue(doc, "name.first")).toBeUndefined()
  })

  test("array field returns array", () => {
    expect(getNestedValue(doc, "tags")).toEqual(["a", "b"])
  })

  test("array step collects from each element", () => {
    const orders = { items: [{ name: "a" }, { name: "b" }, {}] }

    expect(getNestedValue(orders, "items.name")).toEqual(["a", "b"])
  })

  test("numeric step indexes into an array", () => {
    expect(getNestedValue({ items: [{ name: "a" }, { name: "b" }] }, "items.1.name")).toBe("b")
  })

  test("nested arrays flatten one level per array step", () => {
    const doc = { a: [{ b: [{ c: 1 }, { c: 2 }] }, { b: [{ c: 3 }] }] }

    expect(getNestedValue(doc, "a.b.c")).toEqual([1, 2, 3])
  })
})
