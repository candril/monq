import { describe, test, expect } from "bun:test"
import { buildSchemaMap } from "./schema"
import {
  MAX_SEARCH_FIELDS,
  buildSearchFilter,
  isSearchToken,
  searchTermsOf,
  searchableFields,
  termsReadyForLive,
} from "./search"
import { parseSimpleQueryFull } from "./parser"

const schema = buildSchemaMap([
  { _id: "x", name: "Alice", age: 30, address: { city: "Berlin" }, tags: ["a"] },
])

describe("isSearchToken", () => {
  test("plain word is a search token", () => {
    expect(isSearchToken("alice")).toBe(true)
  })

  test("field tokens, projection, marks and operators are not", () => {
    for (const token of ["name:alice", "age>3", "status!=x", "+name", "-name", "@a", "status:"]) {
      expect(isSearchToken(token)).toBe(false)
    }
  })

  test("quoted token is a search token even with operator characters", () => {
    expect(isSearchToken('"a:b"')).toBe(true)
  })
})

describe("searchTermsOf", () => {
  test("extracts bare words and quoted phrases, skipping field tokens", () => {
    expect(searchTermsOf('alice status:active "new york" +name')).toEqual(["alice", "new york"])
  })

  test("drops empty quotes", () => {
    expect(searchTermsOf('""')).toEqual([])
  })
})

describe("searchableFields", () => {
  test("string fields including nested paths", () => {
    expect(searchableFields(schema)).toEqual(["_id", "name", "address.city"])
  })

  test("caps the field count", () => {
    const wide = buildSchemaMap([
      Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`f${i}`, "v"])),
    ])

    expect(searchableFields(wide)).toHaveLength(MAX_SEARCH_FIELDS)
  })
})

describe("buildSearchFilter", () => {
  test("no terms → null", () => {
    expect(buildSearchFilter([], schema)).toBeNull()
  })

  test("one term → $or of case-insensitive regex per string field", () => {
    expect(buildSearchFilter(["ali"], schema)).toEqual({
      $or: [
        { _id: { $regex: "ali", $options: "i" } },
        { name: { $regex: "ali", $options: "i" } },
        { "address.city": { $regex: "ali", $options: "i" } },
      ],
    })
  })

  test("several terms → $and of $or clauses", () => {
    const filter = buildSearchFilter(["a", "b"], schema) as { $and: unknown[] }

    expect(filter.$and).toHaveLength(2)
  })

  test("escapes regex metacharacters", () => {
    const filter = buildSearchFilter(["a.b(c)"], schema) as {
      $or: Record<string, { $regex: string }>[]
    }

    expect(filter.$or[1].name.$regex).toBe("a\\.b\\(c\\)")
  })

  test("no searchable fields → matches nothing", () => {
    expect(buildSearchFilter(["x"], new Map())).toEqual({ $expr: false })
  })
})

describe("termsReadyForLive", () => {
  test("every term needs two characters", () => {
    expect(termsReadyForLive(["ab", "c"])).toBe(false)
    expect(termsReadyForLive(["ab", "cd"])).toBe(true)
    expect(termsReadyForLive([])).toBe(true)
  })
})

describe("parseSimpleQueryFull with search terms", () => {
  test("combines search with field tokens", () => {
    const { filter, searchTerms } = parseSimpleQueryFull("ali age>3", schema)

    expect(searchTerms).toEqual(["ali"])
    expect(filter).toMatchObject({ age: { $gt: 3 } })
    expect(filter).toHaveProperty("$or")
  })

  test("half-typed operator token is not searched", () => {
    const { filter, searchTerms } = parseSimpleQueryFull("status:", schema)

    expect(searchTerms).toEqual([])
    expect(filter).toEqual({})
  })
})
