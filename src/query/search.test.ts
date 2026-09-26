import { describe, test, expect } from "bun:test"
import { ObjectId } from "mongodb"
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
  test("string fields including nested paths and arrays of strings", () => {
    expect(searchableFields(schema)).toEqual(["_id", "name", "address.city", "tags"])
  })

  test("arrays of mixed items are not searched", () => {
    const mixed = buildSchemaMap([{ tags: ["a", 1] }])

    expect(searchableFields(mixed)).toEqual([])
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
        { tags: { $regex: "ali", $options: "i" } },
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

  test("numeric term also matches number fields by equality", () => {
    const filter = buildSearchFilter(["30"], schema) as { $or: object[] }

    expect(filter.$or).toContainEqual({ age: 30 })
  })

  test("ObjectId hex also matches objectid fields", () => {
    const hex = "0000000000000000000007d0"
    const oidSchema = buildSchemaMap([{ _id: new ObjectId(hex), name: "x" }])

    const filter = buildSearchFilter([hex], oidSchema) as { $or: object[] }

    expect(filter.$or).toContainEqual({ _id: new ObjectId(hex) })
  })

  test("date term also matches that day on date fields", () => {
    const dateSchema = buildSchemaMap([{ since: new Date("2026-01-01T10:00:00Z") }])

    const filter = buildSearchFilter(["2026-01-15"], dateSchema) as { $or: object[] }

    expect(filter.$or).toContainEqual({
      since: {
        $gte: new Date("2026-01-15T00:00:00.000Z"),
        $lte: new Date("2026-01-15T23:59:59.999Z"),
      },
    })
  })

  test("text engine sends every term as a quoted phrase", () => {
    expect(buildSearchFilter(["alice", "new york"], schema, "text")).toEqual({
      $text: { $search: '"alice" "new york"' },
    })
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

  test("text engine combines with field tokens", () => {
    const { filter } = parseSimpleQueryFull("ali age>3 +name", schema, undefined, "text")

    expect(filter).toEqual({ age: { $gt: 3 }, $text: { $search: '"ali"' } })
  })

  test("half-typed operator token is not searched", () => {
    const { filter, searchTerms } = parseSimpleQueryFull("status:", schema)

    expect(searchTerms).toEqual([])
    expect(filter).toEqual({})
  })
})
