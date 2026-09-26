/**
 * Global search: bare words in the simple query bar become a case-insensitive
 * substring search across every string field the schema knows (spec 067).
 *
 *   "alice"         -> { $or: [{ name: /alice/i }, { email: /alice/i }, ...] }
 *   "alice berlin"  -> { $and: [{ $or: [...alice] }, { $or: [...berlin] }] }
 *   '"new york"'    -> one phrase term
 */

import type { Document } from "mongodb"
import type { SchemaMap } from "./schema"
import { tokenize } from "./tokenize"

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

export function searchableFields(schemaMap: SchemaMap): string[] {
  const fields: string[] = []
  for (const info of schemaMap.values()) {
    if (info.type === "string") {
      fields.push(info.path)
    }
  }
  return fields.slice(0, MAX_SEARCH_FIELDS)
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * The filter clause for a set of search terms, or null when there are none.
 * With no searchable field the clause matches nothing — `$or: []` is rejected
 * by the server, and silently dropping the terms would return everything.
 */
export function buildSearchFilter(terms: string[], schemaMap: SchemaMap): Document | null {
  if (terms.length === 0) {
    return null
  }
  const fields = searchableFields(schemaMap)
  if (fields.length === 0) {
    return { $expr: false }
  }
  const clauses = terms.map((term) => ({
    $or: fields.map((field) => ({ [field]: { $regex: escapeRegex(term), $options: "i" } })),
  }))
  return clauses.length === 1 ? clauses[0] : { $and: clauses }
}

/** True when every term is long enough to be worth a live query. */
export function termsReadyForLive(terms: string[]): boolean {
  return terms.every((term) => term.length >= MIN_LIVE_TERM_LENGTH)
}
