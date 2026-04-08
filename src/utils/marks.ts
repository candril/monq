/**
 * Document marks — vim-style letter bookmarks scoped per (host, db, col).
 *
 * Persisted to ~/.local/share/monq/marks (XDG, alongside `history`).
 * JSON-lines format: one {host, db, col, id, letter} per line. Each
 * (host, db, col, id) tuple has at most one row, so re-marking with a new
 * letter rewrites the row, and toggling off deletes it.
 *
 * Document identity is the canonical string form of `_id`:
 *   - ObjectId  → 24-char hex (`toHexString()`)
 *   - everything else → strict EJSON
 * This keeps the marks file independent of BSON types so that string `_id`s,
 * ObjectId `_id`s, and compound `_id`s all work uniformly.
 */

import { homedir } from "os"
import { join } from "path"
import { mkdir } from "fs/promises"
import { EJSON } from "bson"
import { ObjectId } from "mongodb"

/** Soft cap on the number of stored marks; old entries are dropped FIFO. */
const MAX_MARKS = 5000

export interface MarkScope {
  host: string
  db: string
  col: string
}

export interface MarkEntry {
  host: string
  db: string
  col: string
  id: string
  letter: string
}

type MaybeObjectId = { toHexString?: () => string; _bsontype?: string }

/**
 * Canonical id string for storage.
 * ObjectId → hex string; everything else → strict EJSON.
 * This guarantees a stable round-trippable key per document.
 */
export function markDocId(id: unknown): string {
  if (id == null) {
    return ""
  }
  const maybe = id as MaybeObjectId
  if (typeof maybe.toHexString === "function") {
    return maybe.toHexString()
  }
  if (typeof id === "string") {
    return id
  }
  try {
    return EJSON.stringify(id, { relaxed: false })
  } catch {
    return String(id)
  }
}

function marksPath(): string {
  const base = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share")
  return join(base, "monq", "marks")
}

function parseLine(line: string): MarkEntry | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }
  try {
    const obj = JSON.parse(trimmed) as unknown
    if (
      obj &&
      typeof obj === "object" &&
      typeof (obj as MarkEntry).host === "string" &&
      typeof (obj as MarkEntry).db === "string" &&
      typeof (obj as MarkEntry).col === "string" &&
      typeof (obj as MarkEntry).id === "string" &&
      typeof (obj as MarkEntry).letter === "string" &&
      /^[a-z]$/.test((obj as MarkEntry).letter)
    ) {
      const e = obj as MarkEntry
      return { host: e.host, db: e.db, col: e.col, id: e.id, letter: e.letter }
    }
  } catch {
    // ignore malformed line
  }
  return null
}

/** Load all marks from disk. Returns [] on any error. */
export async function loadMarks(): Promise<MarkEntry[]> {
  try {
    const text = await Bun.file(marksPath()).text()
    const parsed: MarkEntry[] = []
    for (const line of text.split("\n")) {
      const entry = parseLine(line)
      if (entry) {
        parsed.push(entry)
      }
    }
    return parsed
  } catch {
    return []
  }
}

async function writeMarks(entries: MarkEntry[]): Promise<void> {
  const path = marksPath()
  await mkdir(join(path, ".."), { recursive: true })
  // Cap at MAX_MARKS — drop the oldest entries (front of file)
  const capped = entries.length > MAX_MARKS ? entries.slice(-MAX_MARKS) : entries
  const content = capped.map((e) => JSON.stringify(e)).join("\n") + (capped.length ? "\n" : "")
  await Bun.write(path, content)
}

function sameScope(entry: MarkEntry, scope: MarkScope): boolean {
  return entry.host === scope.host && entry.db === scope.db && entry.col === scope.col
}

/**
 * Set or replace a mark on (scope, id). If a mark already exists for the doc,
 * it's overwritten with the new letter. Returns the new full mark list.
 */
export async function setMark(scope: MarkScope, id: string, letter: string): Promise<MarkEntry[]> {
  try {
    const existing = await loadMarks()
    const filtered = existing.filter((e) => !(sameScope(e, scope) && e.id === id))
    filtered.push({ host: scope.host, db: scope.db, col: scope.col, id, letter })
    await writeMarks(filtered)
    return filtered
  } catch {
    return loadMarks()
  }
}

/** Delete a mark by (scope, id). Returns the new full mark list. */
export async function clearMark(scope: MarkScope, id: string): Promise<MarkEntry[]> {
  try {
    const existing = await loadMarks()
    const filtered = existing.filter((e) => !(sameScope(e, scope) && e.id === id))
    if (filtered.length !== existing.length) {
      await writeMarks(filtered)
    }
    return filtered
  } catch {
    return loadMarks()
  }
}

/** Clear every mark for a given scope. Returns the new full mark list. */
export async function clearAllMarks(scope: MarkScope): Promise<MarkEntry[]> {
  try {
    const existing = await loadMarks()
    const filtered = existing.filter((e) => !sameScope(e, scope))
    if (filtered.length !== existing.length) {
      await writeMarks(filtered)
    }
    return filtered
  } catch {
    return loadMarks()
  }
}

/** Drop the listed (scope, id) tuples from storage. Used to prune stale marks. */
export async function pruneMarks(scope: MarkScope, ids: Iterable<string>): Promise<MarkEntry[]> {
  try {
    const dropSet = new Set(ids)
    if (dropSet.size === 0) {
      return loadMarks()
    }
    const existing = await loadMarks()
    const filtered = existing.filter((e) => !(sameScope(e, scope) && dropSet.has(e.id)))
    if (filtered.length !== existing.length) {
      await writeMarks(filtered)
    }
    return filtered
  } catch {
    return loadMarks()
  }
}

/** Build a `id → letter` map for the given scope. */
export function marksForScope(all: MarkEntry[], scope: MarkScope): Map<string, string> {
  const map = new Map<string, string>()
  for (const e of all) {
    if (sameScope(e, scope)) {
      map.set(e.id, e.letter)
    }
  }
  return map
}

/**
 * Decode a canonical mark id back to a native value usable in a Mongo
 * `_id: { $in: [...] }` filter.
 *
 * - 24-char hex → ObjectId
 * - EJSON-tagged values (e.g. `{"$oid":"…"}`) → deserialised native
 * - everything else → the original string (Mongo can match string ids directly)
 */
export function decodeMarkId(id: string): unknown {
  if (/^[0-9a-fA-F]{24}$/.test(id)) {
    return new ObjectId(id)
  }
  // EJSON values are JSON; plain strings (e.g. "alice") aren't.
  if (id.startsWith("{") || id.startsWith("[") || id.startsWith('"')) {
    try {
      return EJSON.parse(id, { relaxed: false })
    } catch {
      // fall through to literal
    }
  }
  return id
}

/** All canonical ids for a (scope, letter) pair. */
export function idsForLetter(all: MarkEntry[], scope: MarkScope, letter: string): string[] {
  const result: string[] = []
  for (const e of all) {
    if (sameScope(e, scope) && e.letter === letter) {
      result.push(e.id)
    }
  }
  return result
}

/** All letters used in a scope, with the count of docs each one tags. */
export function lettersInScope(all: MarkEntry[], scope: MarkScope): Map<string, number> {
  const counts = new Map<string, number>()
  for (const e of all) {
    if (sameScope(e, scope)) {
      counts.set(e.letter, (counts.get(e.letter) ?? 0) + 1)
    }
  }
  return counts
}
