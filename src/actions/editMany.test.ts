import { describe, test, expect } from "bun:test"
import { ObjectId } from "mongodb"
import { diffDocs } from "./editMany"

function makeId() {
  return new ObjectId()
}

describe("diffDocs", () => {
  test("no changes — all docs unchanged", () => {
    // arrange
    const id = makeId()
    const docs = [{ _id: id, name: "Alice", age: 30 }]

    // act
    const { result, toReplace } = diffDocs(docs, docs)

    // assert
    expect(result.updated).toBe(0)
    expect(result.unchanged).toBe(1)
    expect(result.missing).toHaveLength(0)
    expect(result.added).toHaveLength(0)
    expect(toReplace).toHaveLength(0)
  })

  test("edited field — doc marked for update", () => {
    // arrange
    const id = makeId()
    const original = [{ _id: id, name: "Alice", age: 30 }]
    const edited = [{ _id: id, name: "Alice", age: 31 }]

    // act
    const { result, toReplace } = diffDocs(original, edited)

    // assert
    expect(result.updated).toBe(1)
    expect(result.unchanged).toBe(0)
    expect(toReplace).toHaveLength(1)
    expect(toReplace[0].originalId).toEqual(id)
    expect(toReplace[0].newDoc).toEqual({ name: "Alice", age: 31 })
  })

  test("_id is excluded from the replacement payload", () => {
    // arrange
    const id = makeId()
    const original = [{ _id: id, name: "Alice" }]
    const edited = [{ _id: id, name: "Bob" }]

    // act
    const { toReplace } = diffDocs(original, edited)

    // assert
    expect(toReplace[0].newDoc).not.toHaveProperty("_id")
  })

  test("removed doc — appears in missing", () => {
    // arrange
    const id1 = makeId()
    const id2 = makeId()
    const original = [{ _id: id1, name: "Alice" }, { _id: id2, name: "Bob" }]
    const edited = [{ _id: id1, name: "Alice" }]

    // act
    const { result } = diffDocs(original, edited)

    // assert
    expect(result.missing).toHaveLength(1)
    expect((result.missing[0]._id as ObjectId).toHexString()).toBe(id2.toHexString())
    expect(result.updated).toBe(0)
    expect(result.unchanged).toBe(1)
  })

  test("new doc without _id — appears in added", () => {
    // arrange
    const id = makeId()
    const original = [{ _id: id, name: "Alice" }]
    const edited = [{ _id: id, name: "Alice" }, { name: "Charlie" }]

    // act
    const { result } = diffDocs(original, edited)

    // assert
    expect(result.added).toHaveLength(1)
    expect(result.added[0].name).toBe("Charlie")
  })

  test("doc with unknown _id — appears in added, not updated", () => {
    // arrange
    const id1 = makeId()
    const id2 = makeId()
    const original = [{ _id: id1, name: "Alice" }]
    const edited = [{ _id: id1, name: "Alice" }, { _id: id2, name: "Ghost" }]

    // act
    const { result } = diffDocs(original, edited)

    // assert
    expect(result.added).toHaveLength(1)
    expect((result.added[0]._id as ObjectId).toHexString()).toBe(id2.toHexString())
  })

  test("all three classifications in one call", () => {
    // arrange
    const id1 = makeId()
    const id2 = makeId()
    const id3 = makeId()
    const original = [
      { _id: id1, name: "Alice", score: 10 }, // will be updated
      { _id: id2, name: "Bob", score: 20 },   // will be unchanged
      { _id: id3, name: "Carol", score: 30 }, // will be missing
    ]
    const edited = [
      { _id: id1, name: "Alice", score: 99 },
      { _id: id2, name: "Bob", score: 20 },
      { name: "Dave" },                        // added (no _id)
    ]

    // act
    const { result, toReplace } = diffDocs(original, edited)

    // assert
    expect(result.updated).toBe(1)
    expect(result.unchanged).toBe(1)
    expect(result.missing).toHaveLength(1)
    expect(result.added).toHaveLength(1)
    expect(toReplace[0].originalId).toEqual(id1)
    expect((result.missing[0]._id as ObjectId).toHexString()).toBe(id3.toHexString())
  })

  test("empty original and empty edited — no changes", () => {
    const { result, toReplace } = diffDocs([], [])

    expect(result.updated).toBe(0)
    expect(result.unchanged).toBe(0)
    expect(result.missing).toHaveLength(0)
    expect(result.added).toHaveLength(0)
    expect(toReplace).toHaveLength(0)
  })

  test("all docs removed — all appear in missing", () => {
    // arrange
    const original = [{ _id: makeId(), name: "Alice" }, { _id: makeId(), name: "Bob" }]

    // act
    const { result } = diffDocs(original, [])

    // assert
    expect(result.missing).toHaveLength(2)
    expect(result.updated).toBe(0)
    expect(result.unchanged).toBe(0)
  })

  test("string _id is supported", () => {
    // arrange
    const original = [{ _id: "abc123", name: "Alice" }]
    const edited = [{ _id: "abc123", name: "Updated" }]

    // act
    const { result, toReplace } = diffDocs(original, edited)

    // assert
    expect(result.updated).toBe(1)
    expect(toReplace[0].originalId).toBe("abc123")
  })

  test("errors array starts empty", () => {
    const { result } = diffDocs([], [])

    expect(result.errors).toHaveLength(0)
  })
})
