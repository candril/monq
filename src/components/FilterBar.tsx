/**
 * Filter bar — bottom panel, two modes:
 *
 * Simple mode (1 row):
 *   [Simple] <input placeholder="field:value ...">
 *
 * BSON mode (expanding panel):
 *   [BSON]  Tab cycle · Ctrl+F format · Ctrl+O sort · Ctrl+J project · ↵ submit
 *   filter ▸
 *   <textarea 4 rows>
 *   sort              (if bsonSortVisible)
 *   <textarea 4 rows>
 *   projection        (if bsonProjectionVisible)
 *   <textarea 4 rows>
 *
 * Textarea is imperative: seeded via initialValue, updated via ref.setText(),
 * changes read via ref.onContentChange.
 */

import { useRef, useEffect } from "react"
import type { TextareaRenderable, TextareaOptions } from "@opentui/core"
import { theme } from "../theme"
import type { BsonSection, QueryMode } from "../types"

type BsonKeyBinding = NonNullable<TextareaOptions["keyBindings"]>[number]

/**
 * Custom key bindings for BSON textareas:
 * - Enter → submit (instead of default newline)
 * - Ctrl+J → newline
 * - Shift+Enter → newline
 */
const BSON_KEY_BINDINGS: BsonKeyBinding[] = [
  { name: "return", action: "submit" },
  { name: "return", ctrl: true, action: "newline" },
  { name: "return", shift: true, action: "newline" },
]

const BADGE_SIMPLE_FG = theme.querySimple
const BADGE_BSON_FG = theme.queryBson
const TEXTAREA_HEIGHT = 4

interface FilterBarProps {
  query: string
  queryMode: QueryMode
  bsonSort: string
  bsonProjection: string
  bsonFocusedSection: BsonSection
  bsonSortVisible: boolean
  bsonProjectionVisible: boolean
  editing?: boolean

  onQueryChange?: (value: string) => void
  onBsonSortChange?: (value: string) => void
  onBsonProjectionChange?: (value: string) => void
  onSubmit?: () => void
}

/**
 * A single labelled BSON textarea section.
 * Uses initialValue to seed; externalValue synced via ref.setText() when it
 * changes externally (e.g. Ctrl+F format, mode migration).
 */
function BsonTextarea({
  label,
  initialValue,
  externalValue,
  focused,
  onChange,
  onSubmit,
}: {
  label: string
  initialValue: string
  externalValue: string
  focused: boolean
  onChange: (v: string) => void
  onSubmit?: () => void
}) {
  const ref = useRef<TextareaRenderable>(null)

  // Wire onContentChange + onSubmit once ref is available
  useEffect(() => {
    const ta = ref.current
    if (!ta) return
    ta.onContentChange = () => {
      onChange(ta.getTextRange(0, 1_000_000))
    }
    ta.onSubmit = onSubmit ? () => onSubmit() : undefined
    return () => {
      if (ref.current) {
        ref.current.onContentChange = undefined
        ref.current.onSubmit = undefined
      }
    }
  }, [ref.current]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keep onSubmit callback fresh without re-running the effect
  useEffect(() => {
    if (ref.current) {
      ref.current.onSubmit = onSubmit ? () => onSubmit() : undefined
    }
  }, [onSubmit])

  // Push external changes (format, migration) back into the textarea
  useEffect(() => {
    const ta = ref.current
    if (!ta) return
    const current = ta.getTextRange(0, 1_000_000)
    if (current !== externalValue) {
      ta.replaceText(externalValue)
    }
  }, [externalValue])

  return (
    <box flexDirection="column">
      <box height={1} paddingLeft={1}>
        <text>
          <span fg={focused ? theme.primary : theme.textMuted}>
            {focused ? `${label} ▸` : label}
          </span>
        </text>
      </box>
      <textarea
        ref={ref}
        initialValue={initialValue}
        placeholder="{ }"
        focused={focused}
        height={TEXTAREA_HEIGHT}
        flexGrow={1}
        backgroundColor={theme.bg}
        focusedBackgroundColor={theme.bg}
        textColor={theme.text}
        placeholderColor={theme.textDim}
        wrapMode="word"
        keyBindings={BSON_KEY_BINDINGS}
      />
    </box>
  )
}

export function FilterBar({
  query,
  queryMode,
  bsonSort,
  bsonProjection,
  bsonFocusedSection,
  bsonSortVisible,
  bsonProjectionVisible,
  editing,
  onQueryChange,
  onBsonSortChange,
  onBsonProjectionChange,
  onSubmit,
}: FilterBarProps) {
  if (!query && !editing) return null

  const badgeLabel = queryMode === "simple" ? "[Simple]" : "[BSON]"
  const badgeFg = queryMode === "simple" ? BADGE_SIMPLE_FG : BADGE_BSON_FG

  const sectionCount =
    1 + (bsonSortVisible ? 1 : 0) + (bsonProjectionVisible ? 1 : 0)
  const bsonHeight = sectionCount * (TEXTAREA_HEIGHT + 1) // textarea + label row

  return (
    <box
      height={editing && queryMode === "bson" ? bsonHeight + 1 : 1}
      backgroundColor={theme.headerBg}
      paddingX={1}
      flexDirection="column"
    >
      {/* Header row: badge + input or hint */}
      <box height={1} flexDirection="row" gap={1}>
        <text>
          <span fg={badgeFg}>{badgeLabel}</span>
        </text>

        {editing ? (
          queryMode === "bson" ? (
            <text>
              <span fg={theme.textMuted}>
                Tab→simple · Ctrl+↵/Shift+↵ newline · Ctrl+F format · Ctrl+O sort · Ctrl+K project · ↵ submit
              </span>
            </text>
          ) : (
            <input
              value={query}
              onInput={onQueryChange}
              onChange={onSubmit}
              placeholder="field:value ..."
              focused={true}
              flexGrow={1}
              backgroundColor={theme.headerBg}
              textColor={theme.text}
              placeholderColor={theme.textDim}
            />
          )
        ) : (
          <text>
            <span fg={theme.text}>{query}</span>
          </text>
        )}
      </box>

      {/* BSON sections — only when editing in bson mode */}
      {editing && queryMode === "bson" && (
        <>
          <BsonTextarea
            label="filter"
            initialValue={query}
            externalValue={query}
            focused={bsonFocusedSection === "filter"}
            onChange={onQueryChange ?? (() => {})}
            onSubmit={onSubmit}
          />
          {bsonSortVisible && (
            <BsonTextarea
              label="sort"
              initialValue={bsonSort}
              externalValue={bsonSort}
              focused={bsonFocusedSection === "sort"}
              onChange={onBsonSortChange ?? (() => {})}
              onSubmit={onSubmit}
            />
          )}
          {bsonProjectionVisible && (
            <BsonTextarea
              label="projection"
              initialValue={bsonProjection}
              externalValue={bsonProjection}
              focused={bsonFocusedSection === "projection"}
              onChange={onBsonProjectionChange ?? (() => {})}
              onSubmit={onSubmit}
            />
          )}
        </>
      )}
    </box>
  )
}
