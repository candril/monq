/**
 * Filter suggestions popup — shows above the filter bar.
 * Suggests field names from columns and subfields from schema map.
 * Handles dot-notation: typing "Members." suggests Members' subfields.
 */

import { useState, useMemo, useEffect } from "react"
import { useKeyboard } from "@opentui/react"
import type { DetectedColumn } from "../types"
import type { SchemaMap } from "../query/schema"
import { getSubfieldSuggestions } from "../query/schema"
import { theme } from "../theme"
import { getLastToken } from "../query/parser"
import { fuzzyFilter } from "../utils/fuzzy"

interface Suggestion {
  label: string
  /** Full query string after accepting this suggestion */
  value: string
  /** Type hint to show (e.g. "array", "object") */
  hint?: string
}

interface FilterSuggestionsProps {
  visible: boolean
  query: string
  queryMode: import("../types").QueryMode
  columns: DetectedColumn[]
  schemaMap: SchemaMap
  onChange: (query: string) => void
}

function buildBsonSuggestions(
  columns: DetectedColumn[],
  schemaMap: SchemaMap,
): Suggestion[] {
  const fields = new Set(columns.map((c) => c.field))
  for (const [path, info] of schemaMap) {
    if (!path.includes(".") && info.children.length > 0) fields.add(path)
  }
  return [...fields].map((field) => {
    const info = schemaMap.get(field)
    return {
      label: field,
      value: field,
      hint: info?.type,
    }
  })
}

function buildSuggestions(
  query: string,
  columns: DetectedColumn[],
  schemaMap: SchemaMap,
): Suggestion[] {
  const { prefix, lastToken } = getLastToken(query)

  // If last token contains ":" we're typing a value — no field suggestions
  if (lastToken.includes(":")) return []

  // Strip negation prefix for matching, preserve it in output
  const negated = lastToken.startsWith("-")
  const search = negated ? lastToken.slice(1) : lastToken
  const negPrefix = negated ? "-" : ""

  // Check if we're in dot-notation: "Members." or "Members.Na"
  const dotIndex = search.lastIndexOf(".")
  if (dotIndex >= 0) {
    const parentPath = search.slice(0, dotIndex)
    const subSearch = search.slice(dotIndex + 1)
    const subfields = getSubfieldSuggestions(schemaMap, parentPath)

    if (subfields.length === 0) return []

    const filtered = subSearch
      ? fuzzyFilter(subSearch, subfields, (f) => [f])
      : subfields

    return filtered.map((sub) => {
      const fullPath = `${parentPath}.${sub}`
      const info = schemaMap.get(fullPath)
      const hasChildren = info && info.children.length > 0

      return {
        label: negPrefix + fullPath,
        // If the subfield has children, append "." so user can drill deeper
        // Otherwise append ":" to start typing a value
        value: prefix + negPrefix + fullPath + (hasChildren ? "." : ":"),
        hint: info?.type,
      }
    })
  }

  // Top-level field suggestions
  const fieldNames = columns.map((c) => c.field)

  // Also include schema paths that have children (for drill-down)
  const allFields = new Set(fieldNames)
  for (const [path, info] of schemaMap) {
    if (!path.includes(".") && info.children.length > 0) {
      allFields.add(path)
    }
  }

  const candidates = [...allFields]
  const filtered = search
    ? fuzzyFilter(search, candidates, (f) => [f])
    : candidates

  return filtered.map((field) => {
    const info = schemaMap.get(field)
    const hasChildren = info && info.children.length > 0

    return {
      label: negPrefix + field,
      // Fields with children: append "." for drill-down
      // Leaf fields: append ":" for value
      value: prefix + negPrefix + field + (hasChildren ? "." : ":"),
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
  onChange,
}: FilterSuggestionsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const suggestions = useMemo(
    () => queryMode === "bson"
      ? buildBsonSuggestions(columns, schemaMap)
      : buildSuggestions(query, columns, schemaMap),
    [query, queryMode, columns, schemaMap],
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [suggestions.length])

  useKeyboard((key) => {
    if (!visible || suggestions.length === 0) return

    if (key.name === "up" || (key.ctrl && key.name === "p")) {
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (key.name === "down" || (key.ctrl && key.name === "n")) {
      setSelectedIndex((i) => Math.min(suggestions.length - 1, i + 1))
    } else if (key.ctrl && key.name === "y") {
      if (suggestions[selectedIndex]) {
        onChange(suggestions[selectedIndex].value)
      }
    }
  })

  if (!visible || suggestions.length === 0) return null

  const visibleSuggestions = suggestions.slice(0, MAX_VISIBLE)

  return (
    <box
      position="absolute"
      bottom={1}
      left={0}
      width="100%"
      flexDirection="column"
    >
      <box
        backgroundColor={theme.headerBg}
        flexDirection="column"
        paddingLeft={1}
        paddingRight={1}
      >
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
                <span fg={selected ? theme.primary : theme.textDim}>
                  {suggestion.label}
                </span>
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
