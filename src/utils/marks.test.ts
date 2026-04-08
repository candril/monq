import { describe, test, expect, beforeEach, afterAll } from "bun:test"
import { ObjectId } from "mongodb"
import { mkdtempSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import {
  markDocId,
  loadMarks,
  setMark,
  clearMark,
  clearAllMarks,
  marksForScope,
  idsForLetter,
  lettersInScope,
  type MarkScope,
} from "./marks"

// Each test runs in its own XDG_DATA_HOME so the marks file doesn't pollute
// the user's real ~/.local/share/monq/marks.
const originalXdg = process.env.XDG_DATA_HOME
const tmpRoot = mkdtempSync(join(tmpdir(), "monq-marks-test-"))

beforeEach(() => {
  // fresh per-test data dir so order can't matter
  const dir = mkdtempSync(join(tmpRoot, "case-"))
  process.env.XDG_DATA_HOME = dir
})

afterAll(() => {
  if (originalXdg === undefined) {
    delete process.env.XDG_DATA_HOME
  } else {
    process.env.XDG_DATA_HOME = originalXdg
  }
  rmSync(tmpRoot, { recursive: true, force: true })
})

const scope: MarkScope = { host: "mongodb://localhost:27017", db: "shop", col: "orders" }
const otherCol: MarkScope = { ...scope, col: "users" }
const otherDb: MarkScope = { ...scope, db: "other" }
const otherHost: MarkScope = { ...scope, host: "mongodb://other:27017" }

describe("markDocId", () => {
  test("ObjectId → 24-char hex", () => {
    // arrange
    const id = new ObjectId("507f1f77bcf86cd799439011")

    // act
    const key = markDocId(id)

    // assert
    expect(key).toBe("507f1f77bcf86cd799439011")
  })

  test("string id passes through", () => {
    expect(markDocId("alice@example.com")).toBe("alice@example.com")
  })

  test("number id is EJSON-stringified", () => {
    // numbers should still produce a stable string
    const key = markDocId(42)
    expect(typeof key).toBe("string")
    expect(key.length).toBeGreaterThan(0)
  })

  test("compound _id object is EJSON-stringified deterministically", () => {
    const k1 = markDocId({ a: 1, b: "x" })
    const k2 = markDocId({ a: 1, b: "x" })
    expect(k1).toBe(k2)
  })

  test("null/undefined return empty string", () => {
    expect(markDocId(null)).toBe("")
    expect(markDocId(undefined)).toBe("")
  })
})

describe("setMark / loadMarks round-trip", () => {
  test("writing then loading returns the same entry", async () => {
    // act
    await setMark(scope, "507f1f77bcf86cd799439011", "a")
    const entries = await loadMarks()

    // assert
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({
      host: scope.host,
      db: scope.db,
      col: scope.col,
      id: "507f1f77bcf86cd799439011",
      letter: "a",
    })
  })

  test("setting a different letter on the same doc replaces it", async () => {
    // arrange
    await setMark(scope, "id-1", "a")

    // act
    await setMark(scope, "id-1", "b")
    const entries = await loadMarks()

    // assert
    expect(entries).toHaveLength(1)
    expect(entries[0].letter).toBe("b")
  })

  test("clearMark removes only the targeted doc", async () => {
    // arrange
    await setMark(scope, "id-1", "a")
    await setMark(scope, "id-2", "a")

    // act
    await clearMark(scope, "id-1")
    const entries = await loadMarks()

    // assert
    expect(entries).toHaveLength(1)
    expect(entries[0].id).toBe("id-2")
  })

  test("clearAllMarks removes only the given scope", async () => {
    // arrange
    await setMark(scope, "id-1", "a")
    await setMark(otherCol, "id-1", "b")

    // act
    await clearAllMarks(scope)
    const entries = await loadMarks()

    // assert
    expect(entries).toHaveLength(1)
    expect(entries[0].col).toBe("users")
  })
})

describe("scope isolation", () => {
  test("same id in different collections does not collide", async () => {
    // arrange
    await setMark(scope, "id-1", "a")
    await setMark(otherCol, "id-1", "b")

    // act
    const all = await loadMarks()

    // assert
    expect(all).toHaveLength(2)
    expect(marksForScope(all, scope).get("id-1")).toBe("a")
    expect(marksForScope(all, otherCol).get("id-1")).toBe("b")
  })

  test("different db isolates marks", async () => {
    await setMark(scope, "id-1", "a")
    await setMark(otherDb, "id-1", "a")

    const all = await loadMarks()
    expect(marksForScope(all, scope).size).toBe(1)
    expect(marksForScope(all, otherDb).size).toBe(1)
  })

  test("different host isolates marks", async () => {
    await setMark(scope, "id-1", "a")
    await setMark(otherHost, "id-1", "a")

    const all = await loadMarks()
    expect(marksForScope(all, scope).size).toBe(1)
    expect(marksForScope(all, otherHost).size).toBe(1)
  })
})

describe("query helpers", () => {
  test("idsForLetter returns only ids with that letter in scope", async () => {
    // arrange
    await setMark(scope, "id-1", "a")
    await setMark(scope, "id-2", "a")
    await setMark(scope, "id-3", "b")
    await setMark(otherCol, "id-4", "a")
    const all = await loadMarks()

    // act
    const ids = idsForLetter(all, scope, "a")

    // assert
    expect(ids.sort()).toEqual(["id-1", "id-2"])
  })

  test("lettersInScope counts each used letter", async () => {
    // arrange
    await setMark(scope, "id-1", "a")
    await setMark(scope, "id-2", "a")
    await setMark(scope, "id-3", "b")
    const all = await loadMarks()

    // act
    const letters = lettersInScope(all, scope)

    // assert
    expect(letters.get("a")).toBe(2)
    expect(letters.get("b")).toBe(1)
  })
})

describe("loadMarks error handling", () => {
  test("returns [] when no file exists yet", async () => {
    // fresh tmp dir, no file written
    expect(await loadMarks()).toEqual([])
  })
})
