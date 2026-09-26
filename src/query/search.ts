/**
 * Global search: bare words in the simple query bar become a case-insensitive
 * substring search across every string field the schema knows (spec 067).
 *
 *   "alice"         -> { $or: [{ name: /alice/i }, { email: /alice/i }, ...] }
 *   "alice berlin"  -> { $and: [{ $or: [...alice] }, { $or: [...berlin] }] }
 *   '"new york"'    -> one phrase term
 *
 * The regex engine also matches a term by type where it parses as one: an
 * ObjectId hex against objectid fields, a number against number fields, a
 * YYYY-MM-DD date against that day on date fields. The text engine sends the
 * terms to a `$text` index instead.
 */

import { ObjectId, type Document } from "mongodb"
import type { FieldInfo, FieldType, SchemaMap } from "./schema"
import { tokenize } from "./tokenize"

export type SearchEngine = "regex" | "text"

/** Bounds the size of one `$or` on very wide schemas. */
export const MAX_SEARCH_FIELDS = 40

/**
 * Live search waits for this many characters per term — a single letter
 * matches almost everything and costs a full collection scan per keystroke.
 */
export const MIN_LIVE_TERM_LENGTH = 2

function isQuoted(token: string): boolean {
  return (
    token.length >= 2 &&
    ((token.startsWith('"') && token.endsWith('"')) ||
      (token.startsWith("'") && token.endsWith("'")))
  )
}

/**
 * A token is a search term when it can't be anything else in the simple
 * syntax. Operator characters are excluded so a half-typed `status:` or
 * `age>` never turns into a search while the user is still typing it; to
 * search for such text, quote it.
 */
export function isSearchToken(token: string): boolean {
  if (isQuoted(token)) {
    return true
  }
  return !/^[+\-@]/.test(token) && !/[:<>=!]/.test(token)
}

export function searchTermOf(token: string): string {
  return isQuoted(token) ? token.slice(1, -1) : token
}

/** The search terms of a simple query string, in input order. */
export function searchTermsOf(input: string): string[] {
  return tokenize(input.trim())
    .filter(isSearchToken)
    .map(searchTermOf)
    .filter((term) => term.length > 0)
}

/** The scalar type a query condition on this field compares against. */
function comparedType(info: FieldInfo): FieldType {
  return info.type === "array" ? (info.itemType ?? "mixed") : info.type
}

function fieldsOfType(schemaMap: SchemaMap, type: FieldType): string[] {
  const fields: string[] = []
  for (const info of schemaMap.values()) {
    if (comparedType(info) === type) {
      fields.push(info.path)
    }
  }
  return fields.slice(0, MAX_SEARCH_FIELDS)
}

/** String fields and arrays of strings — `$regex` on an array matches its elements. */
export function searchableFields(schemaMap: SchemaMap): string[] {
  return fieldsOfType(schemaMap, "string")
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

const OBJECT_ID_HEX = /^[0-9a-fA-F]{24}$/
const NUMBER = /^-?\d+(\.\d+)?$/
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function dayRange(term: string): { $gte: Date; $lte: Date } | null {
  const start = new Date(`${term}T00:00:00.000Z`)
  if (isNaN(start.getTime())) {
    return null
  }
  return { $gte: start, $lte: new Date(start.getTime() + 86_400_000 - 1) }
}

/** Per-field conditions under which `term` counts as found. */
function termBranches(term: string, schemaMap: SchemaMap): Document[] {
  const branches: Document[] = searchableFields(schemaMap).map((field) => ({
    [field]: { $regex: escapeRegex(term), $options: "i" },
  }))
  if (OBJECT_ID_HEX.test(term)) {
    const id = new ObjectId(term)
    branches.push(...fieldsOfType(schemaMap, "objectid").map((field) => ({ [field]: id })))
  }
  if (NUMBER.test(term)) {
    const n = Number(term)
    branches.push(...fieldsOfType(schemaMap, "number").map((field) => ({ [field]: n })))
  }
  const range = DATE_ONLY.test(term) ? dayRange(term) : null
  if (range) {
    branches.push(...fieldsOfType(schemaMap, "date").map((field) => ({ [field]: range })))
  }
  return branches
}

/**
 * Every term is sent as a quoted phrase: `$text` ORs bare words but ANDs
 * phrases, and AND is what the regex engine does — adding a word should
 * narrow the result in both.
 */
function textSearchFilter(terms: string[]): Document {
  return { $text: { $search: terms.map((term) => `"${term.replace(/"/g, "")}"`).join(" ") } }
}

/**
 * The filter clause for a set of search terms, or null when there are none.
 * A term with nothing to match against matches nothing — `$or: []` is
 * rejected by the server, and dropping the term would return everything.
 */
export function buildSearchFilter(
  terms: string[],
  schemaMap: SchemaMap,
  engine: SearchEngine = "regex",
): Document | null {
  if (terms.length === 0) {
    return null
  }
  if (engine === "text") {
    return textSearchFilter(terms)
  }
  const clauses = terms.map((term) => {
    const branches = termBranches(term, schemaMap)
    return branches.length > 0 ? { $or: branches } : { $expr: false }
  })
  return clauses.length === 1 ? clauses[0] : { $and: clauses }
}

/** What the filter bar shows while a query searches, or null when it doesn't. */
export function searchIndicator(
  input: string,
  schemaMap: SchemaMap,
  engine: SearchEngine,
): string | null {
  if (searchTermsOf(input).length === 0) {
    return null
  }
  if (engine === "text") {
    return "⌕ text index"
  }
  const count = searchableFields(schemaMap).length
  return `⌕ regex · ${count} ${count === 1 ? "field" : "fields"}`
}

export function isTextIndex(index: { key: Record<string, unknown> }): boolean {
  return Object.values(index.key).includes("text")
}

/** True when every term is long enough to be worth a live query. */
export function termsReadyForLive(terms: string[]): boolean {
  return terms.every((term) => term.length >= MIN_LIVE_TERM_LENGTH)
}
