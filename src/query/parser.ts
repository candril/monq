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
import { EJSON } from "bson"
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

// --- Date coercion helpers ---

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/
const RELATIVE = /^(now|today|(ago|in)\((\d+)(d|w|m|h)\))$/

function coerceRelativeDate(raw: string): Date | null {
  const m = RELATIVE.exec(raw)
  if (!m) return null
  const now = new Date()
  if (raw === "now") return now
  if (raw === "today")
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const direction = m[2] === "ago" ? -1 : 1
  const n = parseInt(m[3], 10)
  const unit = m[4]
  switch (unit) {
    case "h":
      return new Date(now.getTime() + direction * n * 3_600_000)
    case "d":
      return new Date(now.getTime() + direction * n * 86_400_000)
    case "w":
      return new Date(now.getTime() + direction * n * 7 * 86_400_000)
    case "m": {
      const d = new Date(now)
      d.setUTCMonth(d.getUTCMonth() + direction * n)
      return d
    }
  }
  return null
}

/** Return true if the date string had no time component (date-only: YYYY-MM-DD) */
function isDateOnly(raw: string): boolean {
  return DATE_ONLY.test(raw)
}

/** Set time to end-of-day UTC on a Date */
function endOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999))
}

/** Serialise a coerced value back to its simple-query string representation */
function serializeValue(v: unknown): string {
  if (v instanceof Date) {
    const isStartOfDay =
      v.getUTCHours() === 0 &&
      v.getUTCMinutes() === 0 &&
      v.getUTCSeconds() === 0 &&
      v.getUTCMilliseconds() === 0
    const isEndOfDay =
      v.getUTCHours() === 23 &&
      v.getUTCMinutes() === 59 &&
      v.getUTCSeconds() === 59 &&
      v.getUTCMilliseconds() === 999
    return isStartOfDay || isEndOfDay ? v.toISOString().slice(0, 10) : v.toISOString()
  }
  if (v instanceof ObjectId) return `ObjectId(${v.toHexString()})`
  return String(v)
}

/** Coerce a string value to its natural type */
function coerceValue(value: string): string | number | boolean | null | ObjectId | Date {
  if (value === "null") return null
  if (value === "true") return true
  if (value === "false") return false

  // Relative date expressions (before numeric check to handle "now", "today" etc.)
  const relDate = coerceRelativeDate(value)
  if (relDate) return relDate

  // ObjectId
  const oidMatch = value.match(/^(?:ObjectId|oid)\(["']?([0-9a-fA-F]{24})["']?\)$/)
  if (oidMatch) return new ObjectId(oidMatch[1])

  // ISO 8601 dates — regex-first to avoid JS date coercion false positives
  if (DATE_ONLY.test(value)) return new Date(value + "T00:00:00.000Z")
  if (DATE_TIME.test(value)) return new Date(value)

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
export function parseSimpleQuery(input: string, schemaMap?: SchemaMap): Filter<Document> {
  return parseSimpleQueryFull(input, schemaMap).filter
}

export function parseSimpleQueryFull(input: string, schemaMap?: SchemaMap): ParsedSimpleQuery {
  const trimmed = input.trim()
  if (!trimmed) return { filter: {}, projection: undefined }

  const tokens = tokenize(trimmed)
  const filter: Record<string, unknown> = {}
  const proj: Record<string, 0 | 1> = {}

  for (let token of tokens) {
    // +field → projection include
    if (token.startsWith("+")) {
      const field = token.slice(1)
      if (field && VALID_FIELD.test(field)) {
        proj[field] = 1
        continue
      }
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
      } else if (rawValue.includes("..")) {
        // Range shorthand: field:v1..v2, field:..v2, field:v1..
        const dotdot = rawValue.indexOf("..")
        const left = rawValue.slice(0, dotdot)
        const right = rawValue.slice(dotdot + 2)
        const lo = left ? coerceValue(left) : null
        const hiRaw = right ? coerceValue(right) : null
        // Apply end-of-day to date-only upper bound
        const hi = hiRaw instanceof Date && isDateOnly(right) ? endOfDay(hiRaw) : hiRaw
        const range: Record<string, unknown> = {}
        if (lo !== null) range.$gte = lo
        if (hi !== null) range.$lte = hi
        if (Object.keys(range).length > 0) setFilterValue(filter, field, range, schemaMap)
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
export function filterToSimple(filter: Record<string, unknown>): {
  query: string
  lossless: boolean
} {
  const opMap: Record<string, string> = {
    $gt: ">",
    $gte: ">=",
    $lt: "<",
    $lte: "<=",
    $ne: "!=",
  }
  const tokens: string[] = []
  let lossless = true

  for (const [key, val] of Object.entries(filter)) {
    if (key.startsWith("$")) {
      lossless = false
      continue
    }

    if (val === null) {
      tokens.push(`${key}:null`)
    } else if (val instanceof Date) {
      tokens.push(`${key}:${serializeValue(val)}`)
    } else if (val instanceof ObjectId) {
      tokens.push(`${key}:ObjectId(${val.toHexString()})`)
    } else if (typeof val === "string") {
      tokens.push(`${key}:${val.includes(" ") ? `"${val}"` : val}`)
    } else if (typeof val === "number" || typeof val === "boolean") {
      tokens.push(`${key}:${val}`)
    } else if (typeof val === "object" && !Array.isArray(val)) {
      const ops = val as Record<string, unknown>
      const entries = Object.entries(ops)

      // Number range: { $gte: N, $lte: M } → field:N..M
      if (
        entries.length === 2 &&
        "$gte" in ops &&
        "$lte" in ops &&
        typeof ops.$gte === "number" &&
        typeof ops.$lte === "number"
      ) {
        tokens.push(`${key}:${ops.$gte}..${ops.$lte}`)
        // Date range: { $gte: Date(start-of-day), $lte: Date(end-of-day) } → field:YYYY-MM-DD..YYYY-MM-DD
      } else if (
        entries.length === 2 &&
        "$gte" in ops &&
        "$lte" in ops &&
        ops.$gte instanceof Date &&
        ops.$lte instanceof Date
      ) {
        tokens.push(`${key}:${serializeValue(ops.$gte)}..${serializeValue(ops.$lte)}`)
      } else if (entries.length === 1 && opMap[entries[0][0]]) {
        tokens.push(`${key}${opMap[entries[0][0]]}${serializeValue(entries[0][1])}`)
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
    .map(([k, v]) => (v === 1 ? `+${k}` : `-${k}`))
    .join(" ")
}

/** Parse a BSON/JSON query string into a MongoDB filter */
export function parseBsonQuery(input: string): Filter<Document> {
  const trimmed = input.trim()
  if (!trimmed) return {}
  return JSON.parse(trimmed) as Filter<Document>
}

/**
 * Convert a simple query string + sort state into BSON textarea strings.
 * Used when switching simple → BSON mode.
 */
export function simpleToBson(
  queryInput: string,
  schemaMap: SchemaMap,
  sortField: string | null,
  sortDirection: 1 | -1,
  currentBsonSort: string,
  currentBsonProjection: string,
): { bsonFilter: string; bsonSort: string; bsonProjection: string } {
  const { filter: migratedFilter, projection: migratedProjObj } = parseSimpleQueryFull(
    queryInput,
    schemaMap,
  )
  let bsonFilter = "{\n  \n}"
  try {
    if (Object.keys(migratedFilter).length > 0) {
      bsonFilter = EJSON.stringify(
        migratedFilter as Parameters<typeof EJSON.stringify>[0],
        undefined,
        2,
      )
    }
  } catch {
    /* leave as empty placeholder */
  }
  const bsonSort = sortField
    ? JSON.stringify({ [sortField]: sortDirection }, null, 2)
    : currentBsonSort
  const bsonProjection = migratedProjObj
    ? JSON.stringify(migratedProjObj, null, 2)
    : currentBsonProjection
  return { bsonFilter, bsonSort, bsonProjection }
}

/**
 * Convert a BSON filter string + projection textarea back to a simple query string.
 * Returns the original strings unchanged if conversion is not possible.
 */
export function bsonToSimple(bsonFilter: string, bsonProjection: string): string {
  let simpleQuery = bsonFilter
  try {
    const filter = JSON.parse(bsonFilter.trim() || "{}")
    const tokens: string[] = []
    let canConvert = true
    for (const [key, val] of Object.entries(filter)) {
      if (val === null) {
        tokens.push(`${key}:null`)
        continue
      }
      if (typeof val === "string") {
        tokens.push(`${key}:${val.includes(" ") ? `"${val}"` : val}`)
        continue
      }
      if (typeof val === "number" || typeof val === "boolean") {
        tokens.push(`${key}:${val}`)
        continue
      }
      if (typeof val === "object" && !Array.isArray(val)) {
        const ops = val as Record<string, unknown>
        const opMap: Record<string, string> = {
          $gt: ">",
          $gte: ">=",
          $lt: "<",
          $lte: "<=",
          $ne: "!=",
        }
        const entries = Object.entries(ops)
        if (entries.length === 1 && opMap[entries[0][0]]) {
          tokens.push(`${key}${opMap[entries[0][0]]}${entries[0][1]}`)
          continue
        }
      }
      canConvert = false
      break
    }
    simpleQuery = canConvert ? tokens.join(" ") : bsonFilter
  } catch {
    /* Not valid JSON — leave as-is */
  }

  let projTokenStr = ""
  if (bsonProjection.trim()) {
    try {
      const proj = JSON.parse(bsonProjection.trim()) as Record<string, unknown>
      const projTokens: string[] = []
      let projOk = true
      for (const [key, val] of Object.entries(proj)) {
        if (val === 1) {
          projTokens.push(`+${key}`)
          continue
        }
        if (val === 0) {
          projTokens.push(`-${key}`)
          continue
        }
        projOk = false
        break
      }
      if (projOk && projTokens.length > 0) projTokenStr = " " + projTokens.join(" ")
    } catch {
      /* skip */
    }
  }

  return simpleQuery + projTokenStr
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
