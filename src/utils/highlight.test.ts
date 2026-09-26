import { describe, test, expect } from "bun:test"
import { searchHighlightPattern, splitMatches } from "./highlight"

describe("splitMatches", () => {
  test("no pattern → whole text unmatched", () => {
    expect(splitMatches("Alice", null)).toEqual([{ text: "Alice", match: false }])
  })

  test("marks case-insensitive matches of every term", () => {
    const pattern = searchHighlightPattern(["ali", "ber"])

    expect(splitMatches("Alice in Berlin", pattern)).toEqual([
      { text: "Ali", match: true },
      { text: "ce in ", match: false },
      { text: "Ber", match: true },
      { text: "lin", match: false },
    ])
  })

  test("regex characters in terms are literal", () => {
    const pattern = searchHighlightPattern(["a.b"])

    expect(splitMatches("axb a.b", pattern)).toEqual([
      { text: "axb ", match: false },
      { text: "a.b", match: true },
    ])
  })

  test("longer term wins over its prefix", () => {
    const pattern = searchHighlightPattern(["new", "new york"])

    expect(splitMatches("new york", pattern)).toEqual([{ text: "new york", match: true }])
  })
})

describe("searchHighlightPattern", () => {
  test("no terms → null", () => {
    expect(searchHighlightPattern([])).toBeNull()
  })
})
