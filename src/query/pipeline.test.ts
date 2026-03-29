import { describe, test, expect } from "bun:test"
import { classifyPipeline, extractFindParts } from "./pipeline"

describe("classifyPipeline", () => {
  test("empty pipeline returns false", () => {
    expect(classifyPipeline([])).toBe(false)
  })

  test("$match only — find compatible", () => {
    expect(classifyPipeline([{ $match: { status: "open" } }])).toBe(false)
  })

  test("$match + $sort — find compatible", () => {
    expect(classifyPipeline([{ $match: {} }, { $sort: { _id: -1 } }])).toBe(false)
  })

  test("$match + $sort + $project — find compatible", () => {
    expect(classifyPipeline([{ $match: {} }, { $sort: { _id: -1 } }, { $project: { name: 1 } }])).toBe(false)
  })

  test("$group — requires aggregate", () => {
    expect(classifyPipeline([{ $group: { _id: "$status" } }])).toBe(true)
  })

  test("$lookup — requires aggregate", () => {
    expect(classifyPipeline([{ $match: {} }, { $lookup: { from: "other" } }])).toBe(true)
  })

  test("$unwind — requires aggregate", () => {
    expect(classifyPipeline([{ $unwind: "$tags" }])).toBe(true)
  })

  test("$limit — requires aggregate", () => {
    expect(classifyPipeline([{ $limit: 10 }])).toBe(true)
  })
})

describe("extractFindParts", () => {
  test("extracts $match as filter", () => {
    // arrange
    const pipeline = [{ $match: { status: "open" } }, { $sort: { _id: -1 } }]

    // act
    const { filter } = extractFindParts(pipeline)

    // assert
    expect(filter).toEqual({ status: "open" })
  })

  test("extracts $sort", () => {
    // arrange
    const pipeline = [{ $match: {} }, { $sort: { createdAt: -1 } }]

    // act
    const { sort } = extractFindParts(pipeline)

    // assert
    expect(sort).toEqual({ createdAt: -1 })
  })

  test("extracts $project", () => {
    // arrange
    const pipeline = [{ $match: {} }, { $project: { name: 1, _id: 0 } }]

    // act
    const { projection } = extractFindParts(pipeline)

    // assert
    expect(projection).toEqual({ name: 1, _id: 0 })
  })

  test("missing stages return undefined", () => {
    // arrange
    const pipeline = [{ $match: { x: 1 } }]

    // act
    const { sort, projection } = extractFindParts(pipeline)

    // assert
    expect(sort).toBeUndefined()
    expect(projection).toBeUndefined()
  })

  test("empty pipeline returns empty filter", () => {
    // act
    const { filter, sort, projection } = extractFindParts([])

    // assert
    expect(filter).toEqual({})
    expect(sort).toBeUndefined()
    expect(projection).toBeUndefined()
  })
})
