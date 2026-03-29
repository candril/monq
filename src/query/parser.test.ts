import { describe, test, expect } from "bun:test"
import { parseSimpleQueryFull, filterToSimple, bsonToSimple, simpleToBson, projectionToSimple } from "./parser"

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
