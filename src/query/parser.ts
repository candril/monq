/**
 * Simple query parser: Key:Value pairs -> MongoDB filter.
 *
 * Token types:
 *   field:value          -> { field: value }
 *   field:[a,b,c]        -> { field: { $in: [a,b,c] } }
 *   -field:value         -> { field: { $ne: value } }
 *   -field:[a,b]         -> { field: { $nin: [a,b] } }
 *   field>25             -> { field: { $gt: 25 } }
 *   field:/regex/flags   -> { field: { $regex, $options } }
 *   +field               -> projection include  (bare, no colon)
 *   -field               -> projection exclude  (bare, no colon)
 *
 * Examples:
 *   "Author:Peter"              -> filter: { "Author": "Peter" }
 *   "Author:Peter State:Closed" -> filter: { "Author": "Peter", "State": "Closed" }
 *   "age>25"                    -> filter: { "age": { "$gt": 25 } }
 *   "name:/^john/i"             -> filter: { "name": { "$regex": "^john", "$options": "i" } }
 *   "Status:[open,closed]"      -> filter: { "Status": { "$in": ["open","closed"] } }
 *   "+Name -State"              -> projection: { Name: 1, State: 0 }
 *   "Author:Peter +Name -State" -> filter + projection combined
 */

import type { Filter, Document } from "mongodb"
import { ObjectId } from "mongodb"
import { getArrayAncestor, type SchemaMap } from "./schema"

/**
 * Set a filter value, using $elemMatch if the field path crosses an array.
 * e.g. Members.Name:peter where Members is array ->
 *   { Members: { $elemMatch: { Name: "peter" } } }
 */
function setFilterValue(
  filter: Record<string, unknown>,
  field: string,
  value: unknown,
  schemaMap?: SchemaMap,
): void {
  if (!schemaMap || !field.includes(".")) {
    filter[field] = value
    return
  }

  const arrayAncestor = getArrayAncestor(schemaMap, field)
  if (!arrayAncestor) {
    filter[field] = value
    return
  }

  const subField = field.slice(arrayAncestor.length + 1)
  const existing = filter[arrayAncestor]

  if (existing && typeof existing === "object" && "$elemMatch" in (existing as object)) {
    const elemMatch = (existing as { $elemMatch: Record<string, unknown> }).$elemMatch
    elemMatch[subField] = value
  } else {
    filter[arrayAncestor] = { $elemMatch: { [subField]: value } }
  }
}

/** Coerce a string value to its natural type */
function coerceValue(value: string): string | number | boolean | null | ObjectId {
  if (value === "null") return null
  if (value === "true") return true
  if (value === "false") return false
  const oidMatch = value.match(/^ObjectId\(["']?([0-9a-fA-F]{24})["']?\)$/)
  if (oidMatch) return new ObjectId(oidMatch[1])
  const num = Number(value)
  if (!isNaN(num) && value.trim() !== "") return num
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

/** Tokenize query string, respecting quoted values */
function tokenize(input: string): string[] {
  const tokens: string[] = []
  let current = ""
  let inQuote: string | null = null

  for (const ch of input) {
    if (inQuote) {
      current += ch
      if (ch === inQuote) inQuote = null
    } else if (ch === '"' || ch === "'") {
      inQuote = ch
      current += ch
    } else if (ch === " ") {
      if (current) tokens.push(current)
      current = ""
    } else {
      current += ch
    }
  }
  if (current) tokens.push(current)
  return tokens
}

/** Valid bare field name: word chars and dots only */
const VALID_FIELD = /^[\w.]+$/

/**
 * Classify a token as a filter token or a projection token.
 *
 * Projection tokens are bare +field or -field with no operator or colon.
 *   +field   -> include
 *   -field   -> exclude (only when no :/>/</ != follows)
 *
 * Filter tokens are everything else (field:value, field>n, -field:value, etc.)
 */
function isProjectionToken(token: string): boolean {
  if (token.startsWith("+")) {
    const field = token.slice(1)
    return VALID_FIELD.test(field)
  }
  if (token.startsWith("-")) {
    const rest = token.slice(1)
    // Only bare -field (no colon or operator) is projection
    return VALID_FIELD.test(rest)
  }
  return false
}

export interface ParsedSimpleQuery {
  filter: Filter<Document>
  projection: Record<string, 0 | 1> | undefined
}

/**
 * Parse a simple query string into filter + projection.
 *
 * +field / bare -field  → projection
 * everything else       → filter
 */
export function parseSimpleQuery(
  input: string,
  schemaMap?: SchemaMap,
): Filter<Document> {
  return parseSimpleQueryFull(input, schemaMap).filter
}

export function parseSimpleQueryFull(
  input: string,
  schemaMap?: SchemaMap,
): ParsedSimpleQuery {
  const trimmed = input.trim()
  if (!trimmed) return { filter: {}, projection: undefined }

  const tokens = tokenize(trimmed)
  const filter: Record<string, unknown> = {}
  const proj: Record<string, 0 | 1> = {}

  for (let token of tokens) {
    // +field → projection include
    if (token.startsWith("+")) {
      const field = token.slice(1)
      if (field && VALID_FIELD.test(field)) { proj[field] = 1; continue }
    }

    // Detect negation prefix for filter: -field:value -> $ne
    // But bare -field (no colon/operator) -> projection exclude
    const negated = token.startsWith("-")
    if (negated) {
      const rest = token.slice(1)
      // Bare -field → projection exclude
      if (VALID_FIELD.test(rest) && !rest.includes(":")) {
        // Double-check: no operator characters anywhere
        if (!/[><!]/.test(rest)) {
          proj[rest] = 0
          continue
        }
      }
      token = rest
    }

    // Regex pattern: field:/pattern/flags
    const regexMatch = token.match(/^([\w.]+):\/(.+)\/([gimsu]*)$/)
    if (regexMatch) {
      const [, field, pattern, flags] = regexMatch
      const val = { $regex: pattern, ...(flags ? { $options: flags } : {}) }
      setFilterValue(filter, field, negated ? { $not: val } : val, schemaMap)
      continue
    }

    // Comparison operators: field>=value, field>value, field<=value, field<value, field!=value
    const opMatch = token.match(/^([\w.]+)(>=|<=|!=|>|<)(.+)$/)
    if (opMatch) {
      const [, field, op, rawValue] = opMatch
      const mongoOp = { ">": "$gt", ">=": "$gte", "<": "$lt", "<=": "$lte", "!=": "$ne" }[op]!
      setFilterValue(filter, field, { [mongoOp]: coerceValue(rawValue) }, schemaMap)
      continue
    }

    // Key:Value pattern
    const colonMatch = token.match(/^([\w.]+):(.+)$/)
    if (colonMatch) {
      const [, field, rawValue] = colonMatch
      if (rawValue === "null") {
        setFilterValue(filter, field, negated ? { $ne: null } : null, schemaMap)
      } else if (rawValue === "exists") {
        setFilterValue(filter, field, { $exists: !negated }, schemaMap)
      } else if (rawValue === "!exists") {
        setFilterValue(filter, field, { $exists: negated }, schemaMap)
      } else if (rawValue.startsWith("size:")) {
        // field:size:N -> { field: { $size: N } }
        const n = Number(rawValue.slice(5))
        if (!isNaN(n)) setFilterValue(filter, field, { $size: n }, schemaMap)
      } else if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
        // Bracket syntax: field:[a,b,c] -> $in / $nin
        const inner = rawValue.slice(1, -1)
        const values = inner.split(",").map((v) => coerceValue(v.trim()))
        setFilterValue(filter, field, negated ? { $nin: values } : { $in: values }, schemaMap)
      } else {
        const val = coerceValue(rawValue)
        setFilterValue(filter, field, negated ? { $ne: val } : val, schemaMap)
      }
      continue
    }

    // Bare text — skip (partial input, no operator)
  }

  return {
    filter,
    projection: Object.keys(proj).length > 0 ? proj : undefined,
  }
}

/**
 * Try to translate a MongoDB filter object back to simple Key:Value syntax.
 * Returns the query string and whether the translation was lossless.
 */
export function filterToSimple(filter: Record<string, unknown>): { query: string; lossless: boolean } {
  const opMap: Record<string, string> = {
    $gt: ">", $gte: ">=", $lt: "<", $lte: "<=", $ne: "!=",
  }
  const tokens: string[] = []
  let lossless = true

  for (const [key, val] of Object.entries(filter)) {
    if (key.startsWith("$")) { lossless = false; continue }

    if (val === null) {
      tokens.push(`${key}:null`)
    } else if (val instanceof ObjectId) {
      tokens.push(`${key}:ObjectId(${val.toHexString()})`)
    } else if (typeof val === "string") {
      tokens.push(`${key}:${val.includes(" ") ? `"${val}"` : val}`)
    } else if (typeof val === "number" || typeof val === "boolean") {
      tokens.push(`${key}:${val}`)
    } else if (typeof val === "object" && !Array.isArray(val)) {
      const ops = val as Record<string, unknown>
      const entries = Object.entries(ops)

      if (entries.length === 1 && opMap[entries[0][0]]) {
        tokens.push(`${key}${opMap[entries[0][0]]}${entries[0][1]}`)
      } else if (entries.length === 1 && entries[0][0] === "$size") {
        tokens.push(`${key}:size:${entries[0][1]}`)
      } else if (entries.length === 1 && entries[0][0] === "$in" && Array.isArray(entries[0][1])) {
        tokens.push(`${key}:[${(entries[0][1] as unknown[]).join(",")}]`)
      } else if (entries.length === 1 && entries[0][0] === "$nin" && Array.isArray(entries[0][1])) {
        tokens.push(`-${key}:[${(entries[0][1] as unknown[]).join(",")}]`)
      } else if ("$regex" in ops) {
        const pattern = ops.$regex as string
        const options = ops.$options as string | undefined
        tokens.push(`${key}:/${pattern}/${options ?? ""}`)
      } else {
        lossless = false
      }
    } else {
      lossless = false
    }
  }

  return { query: tokens.join(" "), lossless }
}

/**
 * Translate a projection object back to +field/-field tokens.
 *   { Name: 1, State: 0 } → "+Name -State"
 */
export function projectionToSimple(proj: Record<string, 0 | 1>): string {
  return Object.entries(proj)
    .map(([k, v]) => v === 1 ? `+${k}` : `-${k}`)
    .join(" ")
}

/** Parse a BSON/JSON query string into a MongoDB filter */
export function parseBsonQuery(input: string): Filter<Document> {
  const trimmed = input.trim()
  if (!trimmed) return {}
  return JSON.parse(trimmed) as Filter<Document>
}

/** Extract the last token being typed (for suggestions) */
export function getLastToken(input: string): { prefix: string; lastToken: string } {
  // If input ends with whitespace, user started a new token
  if (input.length > 0 && input[input.length - 1] === " ") {
    return { prefix: input, lastToken: "" }
  }
  const lastSpace = input.lastIndexOf(" ")
  if (lastSpace === -1) {
    return { prefix: "", lastToken: input }
  }
  return {
    prefix: input.slice(0, lastSpace + 1),
    lastToken: input.slice(lastSpace + 1),
  }
}

// Keep these exports for any code that still references them — they are now no-ops
// since projection is inlined into the query string via +/- tokens.

/** @deprecated Projection is now encoded via +field/-field tokens inline */
export function splitProjection(input: string): { filter: string; projection: string } {
  // Extract projection tokens (+field / bare -field) from the input
  const tokens = input.trim().split(/\s+/)
  const filterTokens: string[] = []
  const projTokens: string[] = []
  for (const t of tokens) {
    if (!t) continue
    if (t.startsWith("+")) {
      const f = t.slice(1)
      if (VALID_FIELD.test(f)) { projTokens.push(t); continue }
    }
    if (t.startsWith("-")) {
      const f = t.slice(1)
      if (VALID_FIELD.test(f) && !/[><!:]/.test(f)) { projTokens.push(t); continue }
    }
    filterTokens.push(t)
  }
  return { filter: filterTokens.join(" "), projection: projTokens.map(t => t.replace(/^\+/, "")).join(" ") }
}

/** @deprecated Use parseSimpleQueryFull instead */
export function parseProjection(projection: string): Record<string, 0 | 1> | undefined {
  if (!projection.trim()) return undefined
  const result: Record<string, 0 | 1> = {}
  for (const token of projection.trim().split(/\s+/)) {
    if (!token) continue
    if (token.startsWith("-")) {
      const f = token.slice(1)
      if (f && VALID_FIELD.test(f)) result[f] = 0
    } else if (token.startsWith("+")) {
      const f = token.slice(1)
      if (f && VALID_FIELD.test(f)) result[f] = 1
    } else if (VALID_FIELD.test(token)) {
      result[token] = 1
    }
  }
  return Object.keys(result).length > 0 ? result : undefined
}

/** @deprecated No longer needed — projection is inline */
export function isInProjection(_input: string): boolean { return false }

/** @deprecated No longer needed — use getLastToken */
export function getLastProjectionToken(_input: string): null { return null }
