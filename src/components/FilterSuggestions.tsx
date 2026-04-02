/**
 * Filter suggestions popup — shows above the filter bar.
 * Suggests field names from columns and subfields from schema map.
 *
 * Token modes (detected from the last token being typed):
 *   +field   → projection include suggestion (field names, no colon suffix)
 *   -field   → projection exclude suggestion (field names, no colon suffix)
 *              BUT only bare -field (no operator chars) — -field:value is a filter
 *   field    → regular filter suggestion (append ":" for leaf, "." for nested)
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
  value: string
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

function buildSuggestions(
  query: string,
  columns: DetectedColumn[],
  schemaMap: SchemaMap,
): Suggestion[] {
  const { prefix, lastToken } = getLastToken(query)

  // Determine token mode
  const isProjectionInclude = lastToken.startsWith("+")
  const isProjectionExclude = lastToken.startsWith("-") && !/[><!:]/.test(lastToken.slice(1))
  const isProjection = isProjectionInclude || isProjectionExclude

  // If it's a filter value token (has colon/operator) — no field suggestions
  if (!isProjection && lastToken.includes(":")) {
    return []
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
  onChange,
}: FilterSuggestionsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const suggestions = useMemo(
    () =>
      queryMode === "bson"
        ? buildBsonSuggestions(columns, schemaMap)
        : buildSuggestions(query, columns, schemaMap),
    [query, queryMode, columns, schemaMap],
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
      if (suggestions[selectedIndex]) {
        onChange(suggestions[selectedIndex].value)
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
