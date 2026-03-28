/**
 * Filter bar — bottom panel, two modes:
 *
 * Simple mode (1 row):
 *   [Simple] <input placeholder="field:value ...">
 *
 * BSON mode (expanding panel):
 *   [BSON]  filter ▸  [sort Ctrl+O]  [projection Ctrl+K]
 *   <textarea 4 rows, filter>
 *   sort ▸            (if bsonSortVisible)
 *   <textarea 4 rows>
 *   projection ▸      (if bsonProjectionVisible)
 *   <textarea 4 rows>
 *
 * Textarea is imperative: seeded via initialValue, updated via ref.replaceText(),
 * changes read via ref.onContentChange. Enter submits, Ctrl+J/Shift+Enter = newline.
 * onSubmit wired via callback ref (not JSX prop — reconciler only handles it for Input).
 */

import { useRef, useEffect, useCallback } from "react"
import type { TextareaRenderable, TextareaOptions } from "@opentui/core"
import { theme } from "../theme"
import type { BsonSection, QueryMode, DetectedColumn } from "../types"
import type { SchemaMap } from "../query/schema"
import { getSubfieldSuggestions } from "../query/schema"
import { fuzzyFilter } from "../utils/fuzzy"

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
  columns: DetectedColumn[]
  schemaMap: SchemaMap

  onQueryChange?: (value: string) => void
  onBsonSortChange?: (value: string) => void
  onBsonProjectionChange?: (value: string) => void
  onSubmit?: () => void
}

// ── Field suggestions for BSON mode ────────────────────────────────────────

function buildBsonSuggestions(columns: DetectedColumn[], schemaMap: SchemaMap): string[] {
  const fields = new Set(columns.map((c) => c.field))
  // Add schema paths with children for dot-notation
  for (const [path, info] of schemaMap) {
    if (!path.includes(".") && info.children.length > 0) fields.add(path)
  }
  return [...fields]
}

function BsonFieldSuggestions({
  visible,
  columns,
  schemaMap,
  onSelect,
}: {
  visible: boolean
  columns: DetectedColumn[]
  schemaMap: SchemaMap
  onSelect: (field: string) => void
}) {
  const suggestions = buildBsonSuggestions(columns, schemaMap)

  if (!visible || suggestions.length === 0) return null

  return (
    <box
      flexDirection="row"
      flexWrap="wrap"
      backgroundColor={theme.headerBg}
      paddingX={1}
      paddingY={0}
      gap={1}
    >
      {suggestions.slice(0, 12).map((field) => {
        const info = schemaMap.get(field)
        return (
          <text key={field}>
            <span fg={theme.textMuted}>{field}</span>
            {info?.type ? <span fg={theme.textMuted}>:{info.type} </span> : <span fg={theme.textMuted}> </span>}
          </text>
        )
      })}
    </box>
  )
}

// ── BsonTextarea ────────────────────────────────────────────────────────────

/**
 * A single labelled BSON textarea section.
 * Uses a callback ref so onContentChange + onSubmit are wired immediately
 * when the renderable is created (avoids the timing issue with useRef + useEffect).
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
  // Keep latest callbacks in a ref so the callback-ref closure stays fresh
  const callbacksRef = useRef({ onChange, onSubmit })
  callbacksRef.current = { onChange, onSubmit }

  const taRef = useRef<TextareaRenderable | null>(null)

  // Callback ref: called with the instance when mounted, null when unmounted
  const setRef = useCallback((ta: TextareaRenderable | null) => {
    if (taRef.current) {
      taRef.current.onContentChange = undefined
      taRef.current.onSubmit = undefined
    }
    taRef.current = ta
    if (!ta) return

    ta.onContentChange = () => {
      callbacksRef.current.onChange(ta.getTextRange(0, 1_000_000))
    }
    ta.onSubmit = () => {
      callbacksRef.current.onSubmit?.()
    }
  }, [])

  // Push external changes (format, migration) into the textarea
  useEffect(() => {
    const ta = taRef.current
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
        ref={setRef}
        initialValue={initialValue}
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

// ── FilterBar ───────────────────────────────────────────────────────────────

export function FilterBar({
  query,
  queryMode,
  bsonSort,
  bsonProjection,
  bsonFocusedSection,
  bsonSortVisible,
  bsonProjectionVisible,
  editing,
  columns,
  schemaMap,
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

  const showBsonSuggestions = editing && queryMode === "bson"

  return (
    <box
      height={editing && queryMode === "bson" ? bsonHeight + 1 : 1}
      backgroundColor={theme.headerBg}
      paddingX={1}
      flexDirection="column"
    >
      {/* Header row: badge + input or BSON pills */}
      <box height={1} flexDirection="row" gap={1}>
        <text>
          <span fg={badgeFg}>{badgeLabel}</span>
        </text>

        {editing ? (
          queryMode === "bson" ? (
            <>
              <text>
                <span fg={bsonFocusedSection === "filter" ? theme.primary : theme.textMuted}>
                  filter{bsonFocusedSection === "filter" ? " ▸" : ""}
                </span>
              </text>
              <text>
                {bsonSortVisible
                  ? <span fg={bsonFocusedSection === "sort" ? theme.primary : theme.warning}>[sort Ctrl+O]</span>
                  : <span fg={theme.textMuted}>[+sort Ctrl+O]</span>
                }
              </text>
              <text>
                {bsonProjectionVisible
                  ? <span fg={bsonFocusedSection === "projection" ? theme.primary : theme.warning}>[projection Ctrl+K]</span>
                  : <span fg={theme.textMuted}>[+projection Ctrl+K]</span>
                }
              </text>
            </>
          ) : (
            <input
              value={query}
              onInput={onQueryChange}
              onSubmit={onSubmit}
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

// ── BsonSuggestions (rendered above the panel in Shell/App) ─────────────────

export function BsonSuggestions({
  visible,
  columns,
  schemaMap,
}: {
  visible: boolean
  columns: DetectedColumn[]
  schemaMap: SchemaMap
}) {
  const suggestions = buildBsonSuggestions(columns, schemaMap)
  if (!visible || suggestions.length === 0) return null

  return (
    <box
      position="absolute"
      bottom={1}
      left={0}
      width="100%"
      backgroundColor={theme.headerBg}
      flexDirection="row"
      flexWrap="wrap"
      paddingX={2}
      paddingY={0}
    >
      {suggestions.slice(0, 20).map((field) => {
        const info = schemaMap.get(field)
        const typeHint = info?.type ? `:${info.type}` : ""
        return (
          <text key={field}>
            <span fg={theme.textDim}>{field}</span>
            <span fg={theme.textMuted}>{typeHint}  </span>
          </text>
        )
      })}
    </box>
  )
}
