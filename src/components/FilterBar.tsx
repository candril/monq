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
 * - Enter → newline (default — submit is handled by useKeyboardNav instead)
 * - Ctrl+J → newline (extra alias)
 * - Shift+Enter → newline (extra alias)
 * Submit is dispatched directly from useKeyboardNav when Enter is pressed
 * in BSON mode, which is more reliable than wiring textarea onSubmit.
 */
const BSON_KEY_BINDINGS: BsonKeyBinding[] = [
  { name: "j", ctrl: true, action: "newline" },
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
  /** Incremented by state on external BSON changes (migration, format) */
  bsonExternalVersion: number
  editing?: boolean
  columns: DetectedColumn[]
  schemaMap: SchemaMap

  onQueryChange?: (value: string) => void
  onBsonSortChange?: (value: string) => void
  onBsonProjectionChange?: (value: string) => void
  onSubmit?: () => void
}


// ── BsonTextarea ────────────────────────────────────────────────────────────

/** Safe wrapper around getTextRange — guards against destroyed buffer */
function safeGetText(ta: TextareaRenderable): string {
  try {
    return ta.getTextRange(0, 1_000_000)
  } catch {
    return ""
  }
}

/**
 * A single labelled BSON textarea section.
 *
 * initialValue  — seeds the textarea on first mount (e.g. "{\n  \n}" or translated filter)
 * externalValue — only pushed in when changed by external actions (format, migration).
 *                 We track the last pushed value to avoid fighting user edits.
 *
 * onSubmit is wired imperatively via callback ref because the React reconciler
 * only handles onSubmit for InputRenderable, not TextareaRenderable.
 */
function BsonTextarea({
  label,
  initialValue,
  currentValue,
  externalVersion,
  focused,
  onChange,
  onSubmit,
}: {
  label: string
  /** Seeds the textarea on first mount */
  initialValue: string
  /** Current value from state — only pushed in when externalVersion changes */
  currentValue: string
  /** Incremented externally (migration, format) to trigger a push of currentValue */
  externalVersion: number
  focused: boolean
  onChange: (v: string) => void
  onSubmit?: () => void
}) {
  const callbacksRef = useRef({ onChange, onSubmit })
  callbacksRef.current = { onChange, onSubmit }

  const taRef = useRef<TextareaRenderable | null>(null)

  const setRef = useCallback((ta: TextareaRenderable | null) => {
    if (taRef.current) {
      try {
        taRef.current.onContentChange = undefined
        taRef.current.onSubmit = undefined
      } catch { /* already destroyed */ }
    }
    taRef.current = ta
    if (!ta) return

    ta.onContentChange = () => {
      const text = safeGetText(ta)
      callbacksRef.current.onChange(text)
    }
    ta.onSubmit = () => {
      callbacksRef.current.onSubmit?.()
    }
  }, [])

  // Only push currentValue into the textarea when an external change happens
  // (version bump). Never on user-typed changes to avoid cursor reset + crash loops.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    try {
      ta.replaceText(currentValue)
    } catch { /* destroyed */ }
  }, [externalVersion]) // intentionally NOT currentValue

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
  bsonExternalVersion,
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
  // header row + sections (textarea + label each)
  const bsonHeight = 1 + sectionCount * (TEXTAREA_HEIGHT + 1)

  return (
    <box
      height={editing && queryMode === "bson" ? bsonHeight : 1}
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
            currentValue={query}
            externalVersion={bsonExternalVersion}
            focused={bsonFocusedSection === "filter"}
            onChange={onQueryChange ?? (() => {})}
            onSubmit={onSubmit}
          />
          {bsonSortVisible && (
            <BsonTextarea
              label="sort"
              initialValue={bsonSort}
              currentValue={bsonSort}
              externalVersion={bsonExternalVersion}
              focused={bsonFocusedSection === "sort"}
              onChange={onBsonSortChange ?? (() => {})}
              onSubmit={onSubmit}
            />
          )}
          {bsonProjectionVisible && (
            <BsonTextarea
              label="projection"
              initialValue={bsonProjection}
              currentValue={bsonProjection}
              externalVersion={bsonExternalVersion}
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


