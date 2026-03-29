import { describe, test, expect } from "bun:test"
import { fuzzyScore, fuzzyFilter } from "./fuzzy"

describe("fuzzyScore", () => {
  test("exact prefix match scores highest tier", () => {
    const score = fuzzyScore("doc", "document edit")

    expect(score).toBeGreaterThan(50)
  })

  test("substring match scores above fuzzy match", () => {
    const substringScore = fuzzyScore("edit", "document edit")
    const fuzzyMatchScore = fuzzyScore("dce", "document edit")

    expect(substringScore).toBeGreaterThan(fuzzyMatchScore)
  })

  test("no match returns 0", () => {
    expect(fuzzyScore("xyz", "document")).toBe(0)
  })

  test("empty query matches as prefix (callers should guard)", () => {
    expect(fuzzyScore("", "document")).toBeGreaterThan(0)
  })

  test("matching is case insensitive", () => {
    expect(fuzzyScore("DOC", "document")).toBeGreaterThan(0)
    expect(fuzzyScore("doc", "DOCUMENT")).toBeGreaterThan(0)
  })

  test("consecutive chars score higher than scattered", () => {
    const consecutive = fuzzyScore("doc", "document")
    const scattered = fuzzyScore("dct", "document")

    expect(consecutive).toBeGreaterThan(scattered)
  })

  test("prefix match scores higher than mid-string match", () => {
    const prefix = fuzzyScore("doc", "document")
    const midString = fuzzyScore("doc", "edit document")

    expect(prefix).toBeGreaterThan(midString)
  })
})

describe("fuzzyFilter", () => {
  const items = [
    { label: "document edit" },
    { label: "document delete" },
    { label: "reload" },
    { label: "open pipeline" },
  ]
  const getFields = (item: { label: string }) => [item.label]

  test("empty query returns all items unchanged", () => {
    const result = fuzzyFilter("", items, getFields)

    expect(result).toHaveLength(items.length)
  })

  test("filters out non-matching items", () => {
    const result = fuzzyFilter("reload", items, getFields)

    expect(result).toHaveLength(1)
    expect(result[0].label).toBe("reload")
  })

  test("results sorted by score descending", () => {
    // arrange
    const query = "doc"

    // act
    const result = fuzzyFilter(query, items, getFields)

    // assert
    expect(result).toHaveLength(2)
    expect(result[0].label).toMatch(/document/)
  })

  test("no match returns empty array", () => {
    const result = fuzzyFilter("zzz", items, getFields)

    expect(result).toHaveLength(0)
  })
})
