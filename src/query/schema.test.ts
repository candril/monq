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
})
