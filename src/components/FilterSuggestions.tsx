/**
 * Filter suggestions popup — shows above the filter bar.
 *
 * Two modes depending on cursor position:
 *
 * **Field position** (no operator after field name):
 *   Suggests field names from columns and subfields from schema map.
 *   Token modes: +field (projection include), -field (projection exclude), field (filter).
 *
 * **Value position** (after : > >= < <= !=):
 *   Suggests quick-filter helpers (date helpers, null) and sampled values
 *   from loaded documents. Accepting a value suggestion submits the query.
 */

import { useState, useMemo, useEffect } from "react"
import { useKeyboard } from "@opentui/react"
import type { Document } from "mongodb"
import type { DetectedColumn } from "../types"
import type { FieldType, SchemaMap } from "../query/schema"
import { getSubfieldSuggestions } from "../query/schema"
import { theme } from "../theme"
import { getLastToken } from "../query/parser"
import { fuzzyFilter } from "../utils/fuzzy"
import { sampleValues } from "../utils/document"

interface Suggestion {
  label: string
  value: string
  hint?: string
  /** When true, accepting this suggestion should submit the query */
  submit?: boolean
}

interface FilterSuggestionsProps {
  visible: boolean
  query: string
  queryMode: import("../types").QueryMode
  columns: DetectedColumn[]
  schemaMap: SchemaMap
  documents: Document[]
  onChange: (query: string) => void
  onSubmit: () => void
}

// ---- Value-position detection ----

/** Regex to split a token into field, operator, and partial value */
const VALUE_OP = /^([^><!:]+)(>=|<=|!=|>|<|:)(.*)$/

interface ValueContext {
  field: string
  op: string
  partial: string
}

function parseValueContext(token: string): ValueContext | null {
  const m = VALUE_OP.exec(token)
  if (!m) {
    return null
  }
  return { field: m[1], op: m[2], partial: m[3] }
}

// ---- Format sampled values for display ----

function formatSampledValue(val: unknown): { label: string; serialized: string } | null {
  if (val === null) {
    return { label: "null", serialized: "null" }
  }
  if (typeof val === "boolean") {
    return { label: String(val), serialized: String(val) }
  }
  if (typeof val === "number") {
    return { label: String(val), serialized: String(val) }
  }
  if (typeof val === "string") {
    // Quote strings that contain spaces
    const serialized = val.includes(" ") ? `"${val}"` : val
    return { label: serialized, serialized }
  }
  if (val instanceof Date) {
    // ISO date shorthand YYYY-MM-DD
    const iso = val.toISOString().slice(0, 10)
    return { label: iso, serialized: iso }
  }
  // BSON ObjectId
  if (typeof val === "object" && val !== null && "_bsontype" in val) {
    const bson = val as { _bsontype: string; toHexString?: () => string }
    if ((bson._bsontype === "ObjectId" || bson._bsontype === "ObjectID") && bson.toHexString) {
      const hex = bson.toHexString()
      return { label: `oid(${hex})`, serialized: `oid(${hex})` }
    }
  }
  return null
}

// ---- Helper suggestions by field type ----

function buildHelperSuggestions(
  fieldType: FieldType | undefined,
  field: string,
  op: string,
): Suggestion[] {
  const suggestions: Suggestion[] = []
  const base = field + op

  if (fieldType === "date") {
    // For ":" operator, suggest range and equality helpers
    // For comparison operators, suggest relative date helpers
    if (op === ":") {
      suggestions.push(
        { label: ">ago(7d)", value: field + ">ago(7d)", hint: "last 7 days", submit: true },
        { label: ">ago(30d)", value: field + ">ago(30d)", hint: "last 30 days", submit: true },
        { label: ">ago(1m)", value: field + ">ago(1m)", hint: "last month", submit: true },
        { label: ">ago(1y)", value: field + ">ago(1y)", hint: "last year", submit: true },
        { label: ":today", value: base + "today", hint: "today", submit: true },
        {
          label: ":ago(7d)..today",
          value: base + "ago(7d)..today",
          hint: "7-day range",
          submit: true,
        },
      )
    } else {
      suggestions.push(
        { label: `${op}ago(7d)`, value: base + "ago(7d)", hint: "7 days ago", submit: true },
        { label: `${op}ago(30d)`, value: base + "ago(30d)", hint: "30 days ago", submit: true },
        { label: `${op}now`, value: base + "now", hint: "now", submit: true },
        { label: `${op}today`, value: base + "today", hint: "today", submit: true },
      )
    }
  }

  // null is valid for all field types
  suggestions.push({ label: "null", value: base + "null", hint: "empty/null check", submit: true })

  return suggestions
}

// ---- Value suggestions from sampled documents ----

function buildValueSuggestions(
  ctx: ValueContext,
  prefix: string,
  schemaMap: SchemaMap,
  documents: Document[],
): Suggestion[] {
  const info = schemaMap.get(ctx.field)
  const fieldType = info?.type

  // Helper suggestions first
  const helpers = buildHelperSuggestions(fieldType, ctx.field, ctx.op)

  // Sampled values from loaded documents
  const sampled = sampleValues(documents, ctx.field)
  const valueSuggestions: Suggestion[] = []
  for (const val of sampled) {
    const formatted = formatSampledValue(val)
    if (!formatted) {
      continue
    }
    valueSuggestions.push({
      label: formatted.label,
      value: prefix + ctx.field + ctx.op + formatted.serialized,
      hint: fieldType ?? typeof val,
      submit: true,
    })
  }

  const all = [...helpers, ...valueSuggestions]

  // Filter by partial input if the user has started typing a value
  if (ctx.partial) {
    const lower = ctx.partial.toLowerCase()
    return all.filter((s) => s.label.toLowerCase().includes(lower))
  }
  return all
}

// ---- BSON mode suggestions (unchanged) ----

function buildBsonSuggestions(columns: DetectedColumn[], schemaMap: SchemaMap): Suggestion[] {
  const fields = new Set(columns.map((c) => c.field))
  for (const [path, info] of schemaMap) {
    if (!path.includes(".") && info.children.length > 0) {
      fields.add(path)
    }
  }
  return [...fields].map((field) => {
    const info = schemaMap.get(field)
    return { label: field, value: field, hint: info?.type }
  })
}

// ---- Field suggestions (simple mode) ----

function buildFieldSuggestions(
  query: string,
  columns: DetectedColumn[],
  schemaMap: SchemaMap,
  documents: Document[],
): Suggestion[] {
  const { prefix, lastToken } = getLastToken(query)

  // Determine token mode
  const isProjectionInclude = lastToken.startsWith("+")
  const isProjectionExclude = lastToken.startsWith("-") && !/[><!:]/.test(lastToken.slice(1))
  const isProjection = isProjectionInclude || isProjectionExclude

  // Value position — switch to value/helper suggestions
  if (!isProjection) {
    const ctx = parseValueContext(lastToken)
    if (ctx) {
      return buildValueSuggestions(ctx, prefix, schemaMap, documents)
    }
  }

  // Strip prefix for search
  const projPrefix = isProjectionInclude ? "+" : isProjectionExclude ? "-" : ""
  const search = lastToken.slice(projPrefix.length)

  // Dot-notation drill-down
  const dotIndex = search.lastIndexOf(".")
  if (dotIndex >= 0) {
    const parentPath = search.slice(0, dotIndex)
    const subSearch = search.slice(dotIndex + 1)
    const subfields = getSubfieldSuggestions(schemaMap, parentPath)
    if (subfields.length === 0) {
      return []
    }
    const filtered = subSearch ? fuzzyFilter(subSearch, subfields, (f) => [f]) : subfields
    return filtered.map((sub) => {
      const fullPath = `${parentPath}.${sub}`
      const info = schemaMap.get(fullPath)
      const hasChildren = info && info.children.length > 0
      // Projection tokens never get ":" suffix — just field name (or "." for drill-down)
      const suffix = hasChildren ? "." : isProjection ? " " : ":"
      return {
        label: projPrefix + fullPath,
        value: prefix + projPrefix + fullPath + suffix,
        hint: info?.type,
      }
    })
  }

  // Top-level field suggestions
  const allFields = new Set(columns.map((c) => c.field))
  for (const [path, info] of schemaMap) {
    if (!path.includes(".") && info.children.length > 0) {
      allFields.add(path)
    }
  }

  const candidates = [...allFields]
  const filtered = search ? fuzzyFilter(search, candidates, (f) => [f]) : candidates

  return filtered.map((field) => {
    const info = schemaMap.get(field)
    const hasChildren = info && info.children.length > 0
    const suffix = hasChildren ? "." : isProjection ? " " : ":"
    return {
      label: projPrefix + field,
      value: prefix + projPrefix + field + suffix,
      hint: info?.type,
    }
  })
}

const MAX_VISIBLE = 15

export function FilterSuggestions({
  visible,
  query,
  queryMode,
  columns,
  schemaMap,
  documents,
  onChange,
  onSubmit,
}: FilterSuggestionsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const suggestions = useMemo(
    () =>
      queryMode === "bson"
        ? buildBsonSuggestions(columns, schemaMap)
        : buildFieldSuggestions(query, columns, schemaMap, documents),
    [query, queryMode, columns, schemaMap, documents],
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [suggestions.length])

  useKeyboard((key) => {
    if (!visible || suggestions.length === 0) {
      return
    }
    if (key.name === "up" || (key.ctrl && key.name === "p")) {
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (key.name === "down" || (key.ctrl && key.name === "n")) {
      setSelectedIndex((i) => Math.min(suggestions.length - 1, i + 1))
    } else if (key.ctrl && key.name === "y") {
      const suggestion = suggestions[selectedIndex]
      if (suggestion) {
        onChange(suggestion.value)
        if (suggestion.submit) {
          onSubmit()
        }
      }
    }
  })

  if (!visible || suggestions.length === 0) {
    return null
  }

  const visibleSuggestions = suggestions.slice(0, MAX_VISIBLE)

  return (
    <box position="absolute" bottom={1} left={0} width="100%" flexDirection="column">
      <box backgroundColor={theme.headerBg} flexDirection="column" paddingLeft={1} paddingRight={1}>
        {visibleSuggestions.map((suggestion, i) => {
          const selected = i === selectedIndex
          return (
            <box
              key={suggestion.label}
              height={1}
              backgroundColor={selected ? theme.selection : undefined}
              paddingLeft={1}
              flexDirection="row"
              justifyContent="space-between"
            >
              <text>
                <span fg={selected ? theme.primary : theme.textDim}>{suggestion.label}</span>
              </text>
              {suggestion.hint && (
                <text>
                  <span fg={theme.textMuted}>{suggestion.hint}</span>
                </text>
              )}
            </box>
          )
        })}
      </box>
    </box>
  )
}
