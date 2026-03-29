import { describe, test, expect } from "bun:test"
import { buildSchemaMap } from "./schema"

describe("buildSchemaMap", () => {
  test("empty array returns empty map", () => {
    expect(buildSchemaMap([])).toEqual(new Map())
  })

  test("detects top-level scalar types", () => {
    // arrange
    const docs = [{ name: "Peter", age: 30, active: true }]

    // act
    const map = buildSchemaMap(docs)

    // assert
    expect(map.get("name")?.type).toBe("string")
    expect(map.get("age")?.type).toBe("number")
    expect(map.get("active")?.type).toBe("boolean")
  })

  test("detects nested fields with dot paths", () => {
    // arrange
    const docs = [{ address: { city: "Berlin", zip: "10115" } }]

    // act
    const map = buildSchemaMap(docs)

    // assert
    expect(map.has("address")).toBe(true)
    expect(map.get("address.city")?.type).toBe("string")
    expect(map.get("address.zip")?.type).toBe("string")
  })

  test("detects array type", () => {
    // arrange
    const docs = [{ tags: ["a", "b"] }]

    // act
    const map = buildSchemaMap(docs)

    // assert
    expect(map.get("tags")?.type).toBe("array")
  })

  test("detects array-of-objects and indexes children", () => {
    // arrange
    const docs = [{ members: [{ name: "Alice" }, { name: "Bob" }] }]

    // act
    const map = buildSchemaMap(docs)

    // assert
    expect(map.has("members.name")).toBe(true)
    expect(map.get("members.name")?.type).toBe("string")
  })

  test("marks mixed type when field has conflicting types across docs", () => {
    // arrange
    const docs = [{ value: "hello" }, { value: 42 }]

    // act
    const map = buildSchemaMap(docs)

    // assert
    expect(map.get("value")?.type).toBe("mixed")
  })

  test("null does not override detected type", () => {
    // arrange
    const docs = [{ name: "Peter" }, { name: null }]

    // act
    const map = buildSchemaMap(docs)

    // assert
    expect(map.get("name")?.type).toBe("string")
  })

  test("children list populated for object fields", () => {
    // arrange
    const docs = [{ address: { city: "Berlin", country: "DE" } }]

    // act
    const map = buildSchemaMap(docs)
    const addressInfo = map.get("address")

    // assert
    expect(addressInfo?.children).toContain("city")
    expect(addressInfo?.children).toContain("country")
  })

  test("multiple documents merged correctly", () => {
    // arrange
    const docs = [
      { name: "Alice", role: "admin" },
      { name: "Bob", age: 25 },
    ]

    // act
    const map = buildSchemaMap(docs)

    // assert
    expect(map.has("name")).toBe(true)
    expect(map.has("role")).toBe(true)
    expect(map.has("age")).toBe(true)
  })

  test("array-of-objects unions children across all sampled items", () => {
    // arrange — each item has a different key; only first-element sampling would miss "role"
    const docs = [{ members: [{ name: "Alice" }, { role: "admin" }, { name: "Bob", role: "user" }] }]

    // act
    const map = buildSchemaMap(docs)

    // assert
    expect(map.has("members.name")).toBe(true)
    expect(map.has("members.role")).toBe(true)
    expect(map.get("members")?.children).toContain("name")
    expect(map.get("members")?.children).toContain("role")
  })

  test("mixed array (scalars + objects) produces no children", () => {
    // arrange
    const docs = [{ tags: ["hello", { nested: true }] }]

    // act
    const map = buildSchemaMap(docs)

    // assert
    expect(map.get("tags")?.type).toBe("array")
    expect(map.get("tags")?.children).toHaveLength(0)
    expect(map.has("tags.nested")).toBe(false)
  })

  test("array of scalars produces no children", () => {
    // arrange
    const docs = [{ tags: ["a", "b", "c"] }]

    // act
    const map = buildSchemaMap(docs)

    // assert
    expect(map.get("tags")?.type).toBe("array")
    expect(map.get("tags")?.children).toHaveLength(0)
  })

  test("depth limit: paths deeper than 3 levels are not indexed", () => {
    // arrange — a.b.c is depth 3 (ok), a.b.c.d is depth 4 (should be ignored)
    const docs = [{ a: { b: { c: { d: "too deep" } } } }]

    // act
    const map = buildSchemaMap(docs)

    // assert
    expect(map.has("a")).toBe(true)
    expect(map.has("a.b")).toBe(true)
    expect(map.has("a.b.c")).toBe(true)
    expect(map.has("a.b.c.d")).toBe(false)
  })

  test("array items beyond MAX_ARRAY_ITEMS (5) are not sampled", () => {
    // arrange — 7 items; items 6 and 7 have a unique key "extra"
    const docs = [
      {
        members: [
          { name: "A" },
          { name: "B" },
          { name: "C" },
          { name: "D" },
          { name: "E" },
          { extra: "F" },
          { extra: "G" },
        ],
      },
    ]

    // act
    const map = buildSchemaMap(docs)

    // assert
    expect(map.has("members.name")).toBe(true)
    expect(map.has("members.extra")).toBe(false)
  })
})
