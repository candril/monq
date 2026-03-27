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
function coerceValue(value: string): string | number | boolean | null {
  if (value === "null") return null
  if (value === "true") return true
  if (value === "false") return false
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
