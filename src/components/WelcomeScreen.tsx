/**
 * WelcomeScreen — inline DB and collection picker shown at startup.
 *
 * Two steps:
 *   Step 1: pick a database  (when dbName === "")
 *   Step 2: pick a collection (when dbName is set but no tab is open)
 *
 * Interaction model (palette-style, full-screen):
 *   - Type to fuzzy-filter the list
 *   - ↑/↓, Ctrl-p/n, Ctrl-k/j → move selection
 *   - Enter → pick highlighted item
 *   - Backspace → delete last filter char; if empty and step 2 → go back
 *   - Esc / q (empty query) → quit
 */

import { useState, useMemo, useEffect } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { fuzzyFilter } from "../utils/fuzzy"
import { theme } from "../theme"

const MIN_LIST_HEIGHT = 10

interface WelcomeScreenProps {
  /** Step 1: list of database names */
  databases: string[]
  /** Step 2: list of collection names */
  collections: string[]
  /** Which step we're on */
  step: 1 | 2
  /** Currently selected database name (shown as breadcrumb in step 2) */
  dbName: string
  /** MongoDB host (shown under the Monq brand) */
  host: string
  /** Called when a database is picked */
  onSelectDatabase: (name: string) => void
  /** Called when a collection is picked */
  onSelectCollection: (name: string) => void
  /** Called when Backspace on empty input in step 2 → back to DB picker */
  onBack: () => void
  /** Called when Backspace on empty input in step 1 → back to URI screen (optional) */
  onBackToUri?: () => void
}

export function WelcomeScreen({
  databases,
  collections,
  step,
  dbName,
  host,
  onSelectDatabase,
  onSelectCollection,
  onBack,
  onBackToUri,
}: WelcomeScreenProps) {
  const renderer = useRenderer()
  const [query, setQuery] = useState("")
  const [cursor, setCursor] = useState(0)

  const items = step === 1 ? databases : collections
  const onSelect = step === 1 ? onSelectDatabase : onSelectCollection

  // Reset query + cursor when the step changes (DB → collection)
  useEffect(() => {
    setQuery("")
    setCursor(0)
  }, [step])

  const filtered = useMemo(
    () => (query ? fuzzyFilter(query, items, (s) => [s]) : items),
    [query, items],
  )

  const safeCursor = Math.min(cursor, Math.max(0, filtered.length - 1))

  useKeyboard((key) => {
    // Move up
    if (key.name === "up" || (key.ctrl && key.name === "p") || (key.ctrl && key.name === "k")) {
      setCursor((c) => Math.max(0, c - 1))
      return
    }
    // Move down
    if (key.name === "down" || (key.ctrl && key.name === "n") || (key.ctrl && key.name === "j")) {
      setCursor((c) => Math.min(filtered.length - 1, c + 1))
      return
    }
    // Pick
    if (key.name === "return") {
      const item = filtered[safeCursor]
      if (item) { setQuery(""); setCursor(0); onSelect(item) }
      return
    }
    // Backspace on empty → go back one level
    if (key.name === "backspace" && !query) {
      if (step === 2) { onBack(); return }
      if (step === 1 && onBackToUri) { onBackToUri(); return }
      return
    }
    // Quit
    if (key.name === "escape" || (key.name === "q" && !query)) {
      renderer.destroy()
    }
  })

  const stepTitle =
    step === 1 ? "Select a database" : `${dbName}  ›  Select a collection`

  const hint =
    step === 2
      ? "↑↓ navigate  ·  Enter select  ·  Backspace back  ·  q quit"
      : onBackToUri
        ? "↑↓ navigate  ·  Enter select  ·  Backspace back  ·  q quit"
        : "↑↓ navigate  ·  Enter select  ·  q quit"

  const loading = items.length === 0

  return (
    <box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">

      {/* Brand */}
      <box marginBottom={1} flexDirection="column" alignItems="center">
        <text>
          <span fg={theme.primary}><strong>Monq</strong></span>
        </text>
        <text>
          <span fg={theme.textDim}>{host}</span>
        </text>
      </box>

      {/* Step title */}
      <box marginBottom={1}>
        <text>
          <span fg={theme.text}>{stepTitle}</span>
        </text>
      </box>

      {/* Search input — top, to avoid layout shifts */}
      <box minWidth={36} flexDirection="column" marginBottom={1}>
        <box>
          <text><span fg={theme.textMuted}>{"─".repeat(36)}</span></text>
        </box>
        <box flexDirection="row" paddingLeft={1} paddingRight={1}>
          <text><span fg={theme.textDim}>{"> "}</span></text>
          <input
            value={query}
            onInput={(v) => { setQuery(v); setCursor(0) }}
            placeholder="type to filter..."
            focused
            backgroundColor={theme.bg}
            textColor={theme.text}
            placeholderColor={theme.textMuted}
            cursorColor={theme.primary}
            width={32}
          />
        </box>
        <box>
          <text><span fg={theme.textMuted}>{"─".repeat(36)}</span></text>
        </box>
      </box>

      {/* Item list — fixed min-height to prevent layout shifts */}
      <box flexDirection="column" minWidth={36} minHeight={MIN_LIST_HEIGHT}>
        {loading ? (
          <box paddingLeft={2} paddingTop={1}>
            <text><span fg={theme.textMuted}>Loading...</span></text>
          </box>
        ) : filtered.length === 0 ? (
          <box paddingLeft={2} paddingTop={1}>
            <text><span fg={theme.textMuted}>No matches</span></text>
          </box>
        ) : (
          filtered.map((item, i) => {
            const isSelected = i === safeCursor
            return (
              <box
                key={item}
                flexDirection="row"
                paddingLeft={2}
                paddingRight={2}
                backgroundColor={isSelected ? theme.selection : undefined}
              >
                <text>
                  <span fg={isSelected ? theme.text : theme.textDim}>{item}</span>
                </text>
              </box>
            )
          })
        )}
      </box>

      {/* Hint row */}
      <box marginTop={1}>
        <text>
          <span fg={theme.textMuted}>{hint}</span>
        </text>
      </box>

    </box>
  )
}
