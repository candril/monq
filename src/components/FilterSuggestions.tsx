/**
 * Filter suggestions popup — shows above the filter bar.
 * Suggests field names from detected columns.
 * Only handles suggestion navigation — text input handled by FilterBar's <input>.
 */

import { useState, useMemo, useEffect } from "react"
import { useKeyboard } from "@opentui/react"
import type { DetectedColumn } from "../types"
import { theme } from "../theme"
import { getLastToken } from "../query/parser"
import { fuzzyFilter } from "../utils/fuzzy"

interface Suggestion {
  label: string
  /** Full query string after accepting this suggestion */
  value: string
}

interface FilterSuggestionsProps {
  visible: boolean
  query: string
  columns: DetectedColumn[]
  onChange: (query: string) => void
}

function buildSuggestions(query: string, columns: DetectedColumn[]): Suggestion[] {
  const { prefix, lastToken } = getLastToken(query)

  // If last token contains ":" we're typing a value — no field suggestions
  if (lastToken.includes(":")) return []

  // Strip negation prefix for matching, preserve it in output
  const negated = lastToken.startsWith("-")
  const search = negated ? lastToken.slice(1) : lastToken
  const negPrefix = negated ? "-" : ""

  // Build field name suggestions
  const fieldNames = columns.map((c) => c.field)
  const filtered = search
    ? fuzzyFilter(search, fieldNames, (f) => [f])
    : fieldNames

  return filtered.map((field) => ({
    label: negPrefix + field,
    value: prefix + negPrefix + field + ":",
  }))
}

const MAX_VISIBLE = 15

export function FilterSuggestions({
  visible,
  query,
  columns,
  onChange,
}: FilterSuggestionsProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  const suggestions = useMemo(
    () => buildSuggestions(query, columns),
    [query, columns],
  )

  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedIndex(0)
  }, [suggestions.length])

  // Only handle suggestion navigation keys
  useKeyboard((key) => {
    if (!visible || suggestions.length === 0) return

    if (key.name === "up" || (key.ctrl && key.name === "p")) {
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (key.name === "down" || (key.ctrl && key.name === "n")) {
      setSelectedIndex((i) => Math.min(suggestions.length - 1, i + 1))
    } else if (key.name === "tab" || (key.ctrl && key.name === "y")) {
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
            >
              <text>
                <span fg={selected ? theme.primary : theme.textDim}>
                  {suggestion.label}
                </span>
              </text>
            </box>
          )
        })}
      </box>
    </box>
  )
}
