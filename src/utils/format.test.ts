import { describe, test, expect } from "bun:test"
import { ObjectId } from "mongodb"
import { formatValue, detectValueType, getNestedValue, padRight, truncate } from "./format"

describe("detectValueType", () => {
  test("null", () => expect(detectValueType(null)).toBe("null"))
  test("undefined", () => expect(detectValueType(undefined)).toBe("null"))
  test("string", () => expect(detectValueType("hello")).toBe("string"))
  test("number", () => expect(detectValueType(42)).toBe("number"))
  test("boolean", () => expect(detectValueType(true)).toBe("boolean"))
  test("date", () => expect(detectValueType(new Date())).toBe("date"))
  test("objectid", () => expect(detectValueType(new ObjectId())).toBe("objectid"))
  test("array", () => expect(detectValueType([1, 2])).toBe("array"))
  test("object", () => expect(detectValueType({ a: 1 })).toBe("object"))
})

describe("formatValue", () => {
  test("null", () => expect(formatValue(null, 20)).toBe("null"))
  test("boolean true", () => expect(formatValue(true, 20)).toBe("true"))
  test("boolean false", () => expect(formatValue(false, 20)).toBe("false"))
  test("number", () => expect(formatValue(42, 20)).toBe("42"))
  test("string", () => expect(formatValue("hello", 20)).toBe("hello"))

  test("ObjectId shows hex", () => {
    // arrange
    const id = new ObjectId()

    // act / assert
    expect(formatValue(id, 40)).toContain(id.toHexString())
  })

  test("array shows bracket notation", () => {
    expect(formatValue([1, 2, 3], 20)).toMatch(/\[/)
  })

  test("object shows brace notation", () => {
    expect(formatValue({ a: 1 }, 20)).toMatch(/\{/)
  })

  test("truncates to maxWidth", () => {
    // arrange
    const long = "a very long string that exceeds the limit"

    // act
    const result = formatValue(long, 10)

    // assert
    expect(result.length).toBeLessThanOrEqual(10)
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
})

describe("padRight", () => {
  test("pads short string", () => {
    expect(padRight("hi", 5)).toBe("hi   ")
  })

  test("truncates long string", () => {
    expect(padRight("hello world", 5)).toBe("hello")
  })

  test("exact width unchanged", () => {
    expect(padRight("hello", 5)).toBe("hello")
  })
})

describe("truncate", () => {
  test("short string unchanged", () => {
    expect(truncate("hi", 10)).toBe("hi")
  })

  test("long string truncated with marker", () => {
    // arrange
    const long = "hello world"

    // act
    const result = truncate(long, 8)

    // assert
    expect(result.length).toBeLessThanOrEqual(8)
    expect(result).toContain("~")
  })
})
