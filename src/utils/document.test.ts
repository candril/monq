import { describe, test, expect } from "bun:test"
import { detectColumns } from "./document"

describe("detectColumns", () => {
  test("empty array returns empty columns", () => {
    expect(detectColumns([])).toEqual([])
  })

  test("_id is always first", () => {
    // arrange
    const docs = [{ _id: "1", name: "Peter", age: 30 }]

    // act
    const cols = detectColumns(docs)

    // assert
    expect(cols[0]).toBe("_id")
  })

  test("all fields present in small set", () => {
    // arrange
    const docs = [{ _id: "1", name: "Peter", age: 30 }]

    // act
    const cols = detectColumns(docs)

    // assert
    expect(cols).toContain("name")
    expect(cols).toContain("age")
  })

  test("scalar fields before complex fields", () => {
    // arrange
    const docs = [{ _id: "1", name: "Peter", address: { city: "Berlin" }, age: 30 }]

    // act
    const cols = detectColumns(docs)

    // assert
    const nameIdx = cols.indexOf("name")
    const ageIdx = cols.indexOf("age")
    const addrIdx = cols.indexOf("address")
    expect(nameIdx).toBeLessThan(addrIdx)
    expect(ageIdx).toBeLessThan(addrIdx)
  })

  test("fields sorted alphabetically within same complexity", () => {
    // arrange
    const docs = [{ _id: "1", zebra: "z", apple: "a", mango: "m" }]

    // act
    const cols = detectColumns(docs).filter((c) => c !== "_id")

    // assert
    expect(cols).toEqual(["apple", "mango", "zebra"])
  })

  test("sparse fields excluded by threshold in large sets", () => {
    // arrange — 50 docs, one field appears in only 1 doc — should be excluded
    const docs = Array.from({ length: 50 }, (_, i) => ({
      _id: String(i),
      common: "value",
      ...(i === 0 ? { rare: "only once" } : {}),
    }))

    // act
    const cols = detectColumns(docs)

    // assert
    expect(cols).not.toContain("rare")
    expect(cols).toContain("common")
  })

  test("all fields included in small sets regardless of sparseness", () => {
    // arrange
    const docs = [
      { _id: "1", common: "a", sparse: "only here" },
      { _id: "2", common: "b" },
    ]

    // act
    const cols = detectColumns(docs)

    // assert
    expect(cols).toContain("sparse")
  })
})
