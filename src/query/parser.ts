/**
 * Simple query parser: Key:Value pairs -> MongoDB filter.
 *
 * Examples:
 *   "Author:Peter"              -> { "Author": "Peter" }
 *   "Author:Peter State:Closed" -> { "Author": "Peter", "State": "Closed" }
 *   "age>25"                    -> { "age": { "$gt": 25 } }
 *   "count!=0"                  -> { "count": { "$ne": 0 } }
 *   "name:/^john/i"             -> { "name": { "$regex": "^john", "$options": "i" } }
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
    // Plain dot-notation (object path)
    filter[field] = value
    return
  }

  // Build $elemMatch: split at the array boundary
  const subField = field.slice(arrayAncestor.length + 1)
  const existing = filter[arrayAncestor]

  if (existing && typeof existing === "object" && "$elemMatch" in (existing as object)) {
    // Append to existing $elemMatch
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
  // ObjectId literal: ObjectId(abc123...) or ObjectId("abc123...")
  const oidMatch = value.match(/^ObjectId\(["']?([0-9a-fA-F]{24})["']?\)$/)
  if (oidMatch) return new ObjectId(oidMatch[1])
  const num = Number(value)
  if (!isNaN(num) && value.trim() !== "") return num
  // Strip quotes if present
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

/** Parse a simple query string into a MongoDB filter.
 *  If schemaMap is provided, uses $elemMatch for fields under array ancestors. */
export function parseSimpleQuery(
  input: string,
  schemaMap?: import("./schema").SchemaMap,
): Filter<Document> {
  const trimmed = input.trim()
  if (!trimmed) return {}

  const tokens = tokenize(trimmed)
  const filter: Record<string, unknown> = {}

  for (let token of tokens) {
    // Detect negation prefix: -Field:Value -> { Field: { $ne: Value } }
    const negated = token.startsWith("-")
    if (negated) token = token.slice(1)

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
      const mongoOp = {
        ">": "$gt",
        ">=": "$gte",
        "<": "$lt",
        "<=": "$lte",
        "!=": "$ne",
      }[op]!
      setFilterValue(filter, field, { [mongoOp]: coerceValue(rawValue) }, schemaMap)
      continue
    }

    // Key:Value pattern
    const colonMatch = token.match(/^([\w.]+):(.+)$/)
    if (colonMatch) {
      const [, field, rawValue] = colonMatch
      // Special values
      if (rawValue === "null") {
        setFilterValue(filter, field, negated ? { $ne: null } : null, schemaMap)
      } else if (rawValue === "exists") {
        setFilterValue(filter, field, { $exists: !negated }, schemaMap)
      } else if (rawValue === "!exists") {
        setFilterValue(filter, field, { $exists: negated }, schemaMap)
      } else {
        const val = coerceValue(rawValue)
        setFilterValue(filter, field, negated ? { $ne: val } : val, schemaMap)
      }
      continue
    }

    // Bare text — skip (could be partial input)
  }

  return filter
}

/**
 * Try to translate a MongoDB filter object back to simple Key:Value syntax.
 * Returns the query string and whether the translation was lossless.
 *
 * Supports:
 *   { field: "value" }           → field:value
 *   { field: 42 }                → field:42
 *   { field: null }              → field:null
 *   { field: { $ne: "x" } }     → field!="x"   (also $gt > $gte >= $lt < $lte <=)
 *   { field: { $regex: "x", $options: "i" } } → field:/x/i
 *
 * Returns lossless=false for: $and/$or/$elemMatch/$in/$nin/nested objects/etc.
 */
export function filterToSimple(filter: Record<string, unknown>): { query: string; lossless: boolean } {
  const opMap: Record<string, string> = {
    $gt: ">", $gte: ">=", $lt: "<", $lte: "<=", $ne: "!=",
  }
  const tokens: string[] = []
  let lossless = true

  for (const [key, val] of Object.entries(filter)) {
    // Skip top-level logical operators — not expressible in simple mode
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

      // Single comparison operator
      if (entries.length === 1 && opMap[entries[0][0]]) {
        tokens.push(`${key}${opMap[entries[0][0]]}${entries[0][1]}`)
      }
      // $regex (with optional $options)
      else if ("$regex" in ops) {
        const pattern = ops.$regex as string
        const options = ops.$options as string | undefined
        tokens.push(`${key}:/${pattern}/${options ?? ""}`)
      }
      // Anything else is lossy
      else {
        lossless = false
      }
    } else {
      // Arrays, nested objects — lossy
      lossless = false
    }
  }

  return { query: tokens.join(" "), lossless }
}

/** Parse a BSON/JSON query string into a MongoDB filter */
export function parseBsonQuery(input: string): Filter<Document> {
  const trimmed = input.trim()
  if (!trimmed) return {}
  return JSON.parse(trimmed) as Filter<Document>
}

/** Extract the last token being typed (for suggestions) */
export function getLastToken(input: string): { prefix: string; lastToken: string } {
  const trimmed = input.trimEnd()
  const lastSpace = trimmed.lastIndexOf(" ")
  if (lastSpace === -1) {
    return { prefix: "", lastToken: trimmed }
  }
  return {
    prefix: trimmed.slice(0, lastSpace + 1),
    lastToken: trimmed.slice(lastSpace + 1),
  }
}
