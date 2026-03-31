import { describe, test, expect } from "bun:test"
import {
  parseSimpleQueryFull,
  filterToSimple,
  bsonToSimple,
  simpleToBson,
  projectionToSimple,
} from "./parser"

const emptySchema = new Map()

describe("parseSimpleQueryFull", () => {
  test("empty input returns empty filter", () => {
    const { filter, projection } = parseSimpleQueryFull("", emptySchema)

    expect(filter).toEqual({})
    expect(projection).toBeUndefined()
  })

  test("key:value → string filter", () => {
    const { filter } = parseSimpleQueryFull("Author:Peter", emptySchema)

    expect(filter).toEqual({ Author: "Peter" })
  })

  test("multiple key:value tokens", () => {
    const { filter } = parseSimpleQueryFull("Author:Peter State:Closed", emptySchema)

    expect(filter).toEqual({ Author: "Peter", State: "Closed" })
  })

  test("numeric value", () => {
    const { filter } = parseSimpleQueryFull("age:25", emptySchema)

    expect(filter).toEqual({ age: 25 })
  })

  test("boolean value", () => {
    const { filter } = parseSimpleQueryFull("active:true", emptySchema)

    expect(filter).toEqual({ active: true })
  })

  test("null value", () => {
    const { filter } = parseSimpleQueryFull("field:null", emptySchema)

    expect(filter).toEqual({ field: null })
  })

  test("gt operator", () => {
    const { filter } = parseSimpleQueryFull("age>25", emptySchema)

    expect(filter).toEqual({ age: { $gt: 25 } })
  })

  test("gte operator", () => {
    const { filter } = parseSimpleQueryFull("age>=25", emptySchema)

    expect(filter).toEqual({ age: { $gte: 25 } })
  })

  test("lt operator", () => {
    const { filter } = parseSimpleQueryFull("age<10", emptySchema)

    expect(filter).toEqual({ age: { $lt: 10 } })
  })

  test("ne operator", () => {
    const { filter } = parseSimpleQueryFull("status!=closed", emptySchema)

    expect(filter).toEqual({ status: { $ne: "closed" } })
  })

  test("$in via array syntax", () => {
    const { filter } = parseSimpleQueryFull("status:[open,closed]", emptySchema)

    expect(filter).toEqual({ status: { $in: ["open", "closed"] } })
  })

  test("$nin via negated array syntax", () => {
    const { filter } = parseSimpleQueryFull("-status:[open,closed]", emptySchema)

    expect(filter).toEqual({ status: { $nin: ["open", "closed"] } })
  })

  test("regex value", () => {
    const { filter } = parseSimpleQueryFull("name:/^john/i", emptySchema)

    expect(filter).toEqual({ name: { $regex: "^john", $options: "i" } })
  })

  test("quoted string value with spaces", () => {
    const { filter } = parseSimpleQueryFull('name:"John Doe"', emptySchema)

    expect(filter).toEqual({ name: "John Doe" })
  })

  test("projection include token", () => {
    const { filter, projection } = parseSimpleQueryFull("+Name", emptySchema)

    expect(filter).toEqual({})
    expect(projection).toEqual({ Name: 1 })
  })

  test("projection exclude token", () => {
    const { filter, projection } = parseSimpleQueryFull("-State", emptySchema)

    expect(filter).toEqual({})
    expect(projection).toEqual({ State: 0 })
  })

  test("filter and projection combined", () => {
    const { filter, projection } = parseSimpleQueryFull("Author:Peter +Name -State", emptySchema)

    expect(filter).toEqual({ Author: "Peter" })
    expect(projection).toEqual({ Name: 1, State: 0 })
  })
})

describe("date coercion in parseSimpleQueryFull", () => {
  test("date-only string coerced to start-of-day UTC Date", () => {
    const { filter } = parseSimpleQueryFull("createdAt:2025-01-01", emptySchema)
    expect(filter).toEqual({ createdAt: new Date("2025-01-01T00:00:00.000Z") })
  })

  test("ISO datetime string coerced to Date", () => {
    const { filter } = parseSimpleQueryFull("createdAt:2025-01-01T15:30:00Z", emptySchema)
    expect(filter).toEqual({ createdAt: new Date("2025-01-01T15:30:00Z") })
  })

  test("gt operator with date", () => {
    const { filter } = parseSimpleQueryFull("createdAt>2025-01-01", emptySchema)
    expect(filter).toEqual({ createdAt: { $gt: new Date("2025-01-01T00:00:00.000Z") } })
  })

  test("gte operator with datetime", () => {
    const { filter } = parseSimpleQueryFull("createdAt>=2025-01-01T12:00:00Z", emptySchema)
    expect(filter).toEqual({ createdAt: { $gte: new Date("2025-01-01T12:00:00Z") } })
  })

  test("lt operator with date", () => {
    const { filter } = parseSimpleQueryFull("createdAt<2025-12-31", emptySchema)
    expect(filter).toEqual({ createdAt: { $lt: new Date("2025-12-31T00:00:00.000Z") } })
  })

  test("ne operator with date", () => {
    const { filter } = parseSimpleQueryFull("createdAt!=2025-06-15", emptySchema)
    expect(filter).toEqual({ createdAt: { $ne: new Date("2025-06-15T00:00:00.000Z") } })
  })

  test("date range: field:date1..date2 (end-of-day on upper bound)", () => {
    const { filter } = parseSimpleQueryFull("createdAt:2025-01-01..2025-12-31", emptySchema)
    expect(filter).toEqual({
      createdAt: {
        $gte: new Date("2025-01-01T00:00:00.000Z"),
        $lte: new Date("2025-12-31T23:59:59.999Z"),
      },
    })
  })

  test("date range: open lower bound (..date)", () => {
    const { filter } = parseSimpleQueryFull("createdAt:..2025-12-31", emptySchema)
    expect(filter).toEqual({ createdAt: { $lte: new Date("2025-12-31T23:59:59.999Z") } })
  })

  test("date range: open upper bound (date..)", () => {
    const { filter } = parseSimpleQueryFull("createdAt:2025-01-01..", emptySchema)
    expect(filter).toEqual({ createdAt: { $gte: new Date("2025-01-01T00:00:00.000Z") } })
  })

  test("relative: now", () => {
    const before = Date.now()
    const { filter } = parseSimpleQueryFull("createdAt>now", emptySchema)
    const after = Date.now()
    const d = (filter as Record<string, { $gt: Date }>).createdAt.$gt
    expect(d.getTime()).toBeGreaterThanOrEqual(before)
    expect(d.getTime()).toBeLessThanOrEqual(after)
  })

  test("relative: today is start-of-day UTC", () => {
    const { filter } = parseSimpleQueryFull("createdAt>=today", emptySchema)
    const d = (filter as Record<string, { $gte: Date }>).createdAt.$gte
    expect(d.getUTCHours()).toBe(0)
    expect(d.getUTCMinutes()).toBe(0)
    expect(d.getUTCSeconds()).toBe(0)
  })

  test("relative: ago(7d) is ~7 days before now", () => {
    const before = Date.now()
    const { filter } = parseSimpleQueryFull("createdAt>ago(7d)", emptySchema)
    const d = (filter as Record<string, { $gt: Date }>).createdAt.$gt
    const diff = before - d.getTime()
    expect(diff).toBeGreaterThanOrEqual(7 * 86_400_000 - 1000)
    expect(diff).toBeLessThanOrEqual(7 * 86_400_000 + 1000)
  })

  test("relative: in(7d) is ~7 days from now", () => {
    const before = Date.now()
    const { filter } = parseSimpleQueryFull("expiresAt<in(7d)", emptySchema)
    const d = (filter as Record<string, { $lt: Date }>).expiresAt.$lt
    const diff = d.getTime() - before
    expect(diff).toBeGreaterThanOrEqual(7 * 86_400_000 - 1000)
    expect(diff).toBeLessThanOrEqual(7 * 86_400_000 + 1000)
  })
})

describe("number range in parseSimpleQueryFull", () => {
  test("field:N..M → $gte/$lte", () => {
    const { filter } = parseSimpleQueryFull("age:18..65", emptySchema)
    expect(filter).toEqual({ age: { $gte: 18, $lte: 65 } })
  })

  test("open lower bound: field:..M → $lte", () => {
    const { filter } = parseSimpleQueryFull("age:..65", emptySchema)
    expect(filter).toEqual({ age: { $lte: 65 } })
  })

  test("open upper bound: field:N.. → $gte", () => {
    const { filter } = parseSimpleQueryFull("age:18..", emptySchema)
    expect(filter).toEqual({ age: { $gte: 18 } })
  })

  test("float bounds", () => {
    const { filter } = parseSimpleQueryFull("price:10.5..99.99", emptySchema)
    expect(filter).toEqual({ price: { $gte: 10.5, $lte: 99.99 } })
  })
})

describe("filterToSimple", () => {
  test("empty filter", () => {
    const { query, lossless } = filterToSimple({})

    expect(query).toBe("")
    expect(lossless).toBe(true)
  })

  test("string field", () => {
    const { query, lossless } = filterToSimple({ Author: "Peter" })

    expect(query).toBe("Author:Peter")
    expect(lossless).toBe(true)
  })

  test("number field", () => {
    const { query, lossless } = filterToSimple({ age: 25 })

    expect(query).toBe("age:25")
    expect(lossless).toBe(true)
  })

  test("$gt operator", () => {
    const { query, lossless } = filterToSimple({ age: { $gt: 25 } })

    expect(query).toBe("age>25")
    expect(lossless).toBe(true)
  })

  test("complex operator marks lossless false", () => {
    const { lossless } = filterToSimple({ tags: { $elemMatch: { val: 1 } } })

    expect(lossless).toBe(false)
  })

  test("null value", () => {
    const { query } = filterToSimple({ field: null })

    expect(query).toBe("field:null")
  })

  test("$in array", () => {
    const { query } = filterToSimple({ status: { $in: ["open", "closed"] } })

    expect(query).toBe("status:[open,closed]")
  })

  test("Date value (start-of-day) round-trips to YYYY-MM-DD", () => {
    const { query, lossless } = filterToSimple({ createdAt: new Date("2025-01-01T00:00:00.000Z") })

    expect(query).toBe("createdAt:2025-01-01")
    expect(lossless).toBe(true)
  })

  test("Date value with time round-trips to full ISO string", () => {
    const { query, lossless } = filterToSimple({ createdAt: new Date("2025-01-01T15:30:00.000Z") })

    expect(query).toBe("createdAt:2025-01-01T15:30:00.000Z")
    expect(lossless).toBe(true)
  })

  test("$gt with Date round-trips correctly", () => {
    const { query, lossless } = filterToSimple({
      createdAt: { $gt: new Date("2025-01-01T00:00:00.000Z") },
    })

    expect(query).toBe("createdAt>2025-01-01")
    expect(lossless).toBe(true)
  })

  test("date range { $gte, $lte } round-trips to field:d1..d2", () => {
    const { query, lossless } = filterToSimple({
      createdAt: {
        $gte: new Date("2025-01-01T00:00:00.000Z"),
        $lte: new Date("2025-12-31T23:59:59.999Z"),
      },
    })

    expect(query).toBe("createdAt:2025-01-01..2025-12-31")
    expect(lossless).toBe(true)
  })

  test("number range { $gte, $lte } round-trips to field:N..M", () => {
    const { query, lossless } = filterToSimple({ age: { $gte: 18, $lte: 65 } })

    expect(query).toBe("age:18..65")
    expect(lossless).toBe(true)
  })
})

describe("bsonToSimple", () => {
  test("simple string field", () => {
    expect(bsonToSimple('{"Author": "Peter"}', "")).toBe("Author:Peter")
  })

  test("number field", () => {
    expect(bsonToSimple('{"age": 25}', "")).toBe("age:25")
  })

  test("$gt operator", () => {
    expect(bsonToSimple('{"age": {"$gt": 25}}', "")).toBe("age>25")
  })

  test("complex operator falls back to original bson string", () => {
    const input = '{"tags": {"$elemMatch": {"val": 1}}}'

    expect(bsonToSimple(input, "")).toBe(input)
  })

  test("projection carried as +field/-field tokens", () => {
    // arrange
    const filter = '{"Author": "Peter"}'
    const projection = '{"Name": 1, "State": 0}'

    // act
    const result = bsonToSimple(filter, projection)

    // assert
    expect(result).toBe("Author:Peter +Name -State")
  })

  test("empty filter string", () => {
    expect(bsonToSimple("{}", "")).toBe("")
  })

  test("invalid JSON falls back gracefully", () => {
    const bad = "not json"

    expect(bsonToSimple(bad, "")).toBe(bad)
  })
})

describe("simpleToBson", () => {
  test("simple filter converts to bson filter string", () => {
    const { bsonFilter } = simpleToBson("Author:Peter", emptySchema, null, -1, "", "")

    expect(JSON.parse(bsonFilter)).toEqual({ Author: "Peter" })
  })

  test("empty query produces empty placeholder", () => {
    const { bsonFilter } = simpleToBson("", emptySchema, null, -1, "", "")

    expect(bsonFilter).toBe("{\n  \n}")
  })

  test("sort field is serialised into bsonSort", () => {
    const { bsonSort } = simpleToBson("", emptySchema, "createdAt", -1, "", "")

    expect(JSON.parse(bsonSort)).toEqual({ createdAt: -1 })
  })

  test("falls back to currentBsonSort when no sortField", () => {
    // arrange
    const existingSort = '{"_id": -1}'

    // act
    const { bsonSort } = simpleToBson("", emptySchema, null, -1, existingSort, "")

    // assert
    expect(bsonSort).toBe(existingSort)
  })

  test("projection token produces bsonProjection", () => {
    const { bsonProjection } = simpleToBson("+Name -State", emptySchema, null, -1, "", "")

    expect(JSON.parse(bsonProjection)).toEqual({ Name: 1, State: 0 })
  })

  test("date value serialised as EJSON $date in bsonFilter", () => {
    const { bsonFilter } = simpleToBson("createdAt>2025-01-01", emptySchema, null, -1, "", "")

    // EJSON.stringify emits { "$date": { "$numberLong": "..." } } or { "$date": "..." }
    const parsed = JSON.parse(bsonFilter)
    expect(parsed).toHaveProperty("createdAt.$gt.$date")
  })
})

describe("projectionToSimple", () => {
  test("include field", () => {
    expect(projectionToSimple({ Name: 1 })).toBe("+Name")
  })

  test("exclude field", () => {
    expect(projectionToSimple({ State: 0 })).toBe("-State")
  })

  test("mixed include and exclude", () => {
    expect(projectionToSimple({ Name: 1, State: 0 })).toBe("+Name -State")
  })

  test("empty projection", () => {
    expect(projectionToSimple({})).toBe("")
  })
})
