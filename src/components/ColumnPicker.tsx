/**
 * Column picker overlay (spec 068). Lists every schema path, filters as you
 * type, toggles with Space, and hands the checked paths back on Enter.
 * Changes are staged: applying re-runs the query, so Esc discards them.
 */

import { useEffect, useMemo, useReducer, useRef } from "react"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { PickerRow } from "../query/columnPicker"
import { theme } from "../theme"
import { initPicker, pickerReducer, visibleRows } from "./columnPickerReducer"

const SCROLL_MARGIN = 2

interface ColumnPickerProps {
  rows: PickerRow[]
  initialChecked: string[]
  defaults: string[]
  onApply: (checked: string[]) => void
  onClose: () => void
}

export function ColumnPicker({
  rows,
  initialChecked,
  defaults,
  onApply,
  onClose,
}: ColumnPickerProps) {
  const [state, dispatch] = useReducer(pickerReducer, undefined, () =>
    initPicker(rows, initialChecked, defaults),
  )
  const { query, cursor, checked, applied } = state
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const { height: terminalHeight } = useTerminalDimensions()

  // Fixed rows: spacer + title + spacer + input (2) + hint (2) = 7.
  const modalHeight = Math.floor(terminalHeight * 0.7)
  const listHeight = Math.max(4, modalHeight - 7)

  const visible = useMemo(() => visibleRows(state), [state])

  // onApply is a fresh closure every parent render; once is enough.
  const handedBack = useRef(false)
  useEffect(() => {
    if (applied && !handedBack.current) {
      handedBack.current = true
      onApply(checked)
    }
  }, [applied, checked, onApply])

  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox) {
      return
    }
    const viewportHeight = scrollbox.viewport?.height ?? 20
    const top = scrollbox.scrollTop
    if (cursor < top + SCROLL_MARGIN) {
      scrollbox.scrollTo(Math.max(0, cursor - SCROLL_MARGIN))
    } else if (cursor >= top + viewportHeight - SCROLL_MARGIN) {
      const maxScroll = Math.max(0, visible.length - viewportHeight)
      scrollbox.scrollTo(Math.min(cursor - viewportHeight + SCROLL_MARGIN + 1, maxScroll))
    }
  }, [cursor, visible.length])

  useKeyboard((key) => {
    const page = Math.max(1, Math.floor(listHeight / 2))
    if (key.name === "escape") {
      onClose()
    } else if (key.name === "return") {
      dispatch({ type: "apply" })
    } else if (key.name === "space" || key.sequence === " ") {
      dispatch({ type: "toggle" })
    } else if (key.shift && (key.name === "up" || key.name === "down")) {
      dispatch({ type: "reorder", delta: key.name === "up" ? -1 : 1 })
    } else if (key.name === "up" || (key.ctrl && (key.name === "p" || key.name === "k"))) {
      dispatch({ type: "move", delta: -1 })
    } else if (key.name === "down" || (key.ctrl && (key.name === "n" || key.name === "j"))) {
      dispatch({ type: "move", delta: 1 })
    } else if (key.ctrl && key.name === "u") {
      dispatch({ type: "move", delta: -page })
    } else if (key.ctrl && key.name === "d") {
      dispatch({ type: "move", delta: page })
    } else if (key.ctrl && key.name === "a") {
      dispatch({ type: "toggle-all" })
    } else if (key.ctrl && key.name === "r") {
      dispatch({ type: "reset" })
    } else if (key.ctrl && key.name === "w") {
      dispatch({ type: "query", edit: (q) => q.replace(/\S+\s*$/, "") })
    } else if (key.name === "backspace") {
      dispatch({ type: "query", edit: (q) => q.slice(0, -1) })
    } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      const typed = key.sequence
      dispatch({ type: "query", edit: (q) => q + typed })
    }
  })

  const pathWidth = Math.max(...visible.map((row) => rowLabel(row, query).length), 0)

  return (
    <box width="100%" height="100%" position="absolute" top={0} left={0}>
      <box
        width="100%"
        height="100%"
        position="absolute"
        top={0}
        left={0}
        backgroundColor={theme.overlayBg}
      />
      <box
        position="absolute"
        top={2}
        left="20%"
        width="60%"
        height={modalHeight}
        flexDirection="column"
        backgroundColor={theme.modalBg}
      >
        <box height={1} />
        <box height={1} paddingLeft={2} flexDirection="row">
          <text>
            <span fg={theme.primary}>Columns</span>
            <span fg={theme.textMuted}>
              {"  "}
              {checked.length}/{rows.length} shown
            </span>
          </text>
        </box>
        <box height={1} />
        <box paddingLeft={2} paddingRight={2} paddingBottom={1} height={2}>
          <text>
            <span fg={query ? theme.text : theme.textMuted}>{query || "Filter fields..."}</span>
          </text>
        </box>

        {visible.length === 0 ? (
          <box paddingLeft={2} height={listHeight}>
            <text>
              <span fg={theme.textMuted}>No fields</span>
            </text>
          </box>
        ) : (
          <scrollbox ref={scrollRef} height={listHeight}>
            {visible.map((row, i) => (
              <PickerRowView
                key={row.path}
                label={rowLabel(row, query)}
                labelWidth={pathWidth}
                type={row.type}
                position={checked.indexOf(row.path)}
                selected={i === cursor}
              />
            ))}
          </scrollbox>
        )}

        <box paddingLeft={2} paddingTop={1} height={2}>
          <text>
            <span fg={theme.textMuted}>
              space toggle · ^a all · ^r reset · shift+↑↓ reorder · enter apply · esc cancel
            </span>
          </text>
        </box>
      </box>
    </box>
  )
}

/** Indented leaf name in tree order; the full path once filtering reorders rows. */
function rowLabel(row: PickerRow, query: string): string {
  if (query) {
    return row.path
  }
  const leaf = row.path.slice(row.path.lastIndexOf(".") + 1)
  return "  ".repeat(row.depth) + leaf
}

function PickerRowView({
  label,
  labelWidth,
  type,
  position,
  selected,
}: {
  label: string
  labelWidth: number
  type: string
  position: number
  selected: boolean
}) {
  const on = position !== -1
  return (
    <box
      flexDirection="row"
      backgroundColor={selected ? theme.selection : undefined}
      paddingLeft={2}
      paddingRight={2}
      width="100%"
      height={1}
    >
      <text>
        <span fg={on ? theme.primary : theme.textMuted}>{on ? "◉ " : "○ "}</span>
        <span fg={theme.textMuted}>{on ? String(position + 1).padStart(2) : "  "} </span>
        <span fg={on || selected ? theme.text : theme.textDim}>{label.padEnd(labelWidth)}</span>
        <span fg={theme.textMuted}>
          {"  "}
          {type}
        </span>
      </text>
    </box>
  )
}
