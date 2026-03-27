/**
 * Generic Ctrl+P command palette.
 * Fuzzy search over a list of commands, scrollable results.
 */

import { useState, useMemo, useEffect, useRef } from "react"
import { useKeyboard } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { Command } from "../commands/types"
import { fuzzyFilter } from "../utils/fuzzy"
import { theme } from "../theme"

const SCROLL_MARGIN = 2

interface CommandPaletteProps {
  visible: boolean
  commands: Command[]
  onSelect: (command: Command) => void
  onClose: () => void
  placeholder?: string
}

export function CommandPalette({
  visible,
  commands,
  onSelect,
  onClose,
  placeholder = "Search...",
}: CommandPaletteProps) {
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const scrollRef = useRef<ScrollBoxRenderable>(null)

  // Reset state when opened
  useEffect(() => {
    if (visible) {
      setQuery("")
      setSelectedIndex(0)
    }
  }, [visible])

  // Filter commands by query
  const filtered = useMemo(
    () => fuzzyFilter(query, commands, (cmd) => [cmd.label, cmd.category]),
    [query, commands],
  )

  // Clamp selection when list changes
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1))
    }
  }, [filtered.length])

  // Auto-scroll to keep selection visible
  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox) return

    const viewportHeight = scrollbox.viewport?.height ?? 20
    const scrollTop = scrollbox.scrollTop
    const scrollBottom = scrollTop + viewportHeight

    if (selectedIndex < scrollTop + SCROLL_MARGIN) {
      scrollbox.scrollTo(Math.max(0, selectedIndex - SCROLL_MARGIN))
    } else if (selectedIndex >= scrollBottom - SCROLL_MARGIN) {
      scrollbox.scrollTo(selectedIndex - viewportHeight + SCROLL_MARGIN + 1)
    }
  }, [selectedIndex])

  // Keyboard handling
  useKeyboard((key) => {
    if (!visible) return

    if (key.name === "escape") {
      onClose()
    } else if (key.name === "return") {
      if (filtered[selectedIndex]) {
        onSelect(filtered[selectedIndex])
      }
    } else if (key.name === "up" || (key.ctrl && key.name === "p") || (key.ctrl && key.name === "k")) {
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (key.name === "down" || (key.ctrl && key.name === "n") || (key.ctrl && key.name === "j")) {
      setSelectedIndex((i) => Math.min(filtered.length - 1, i + 1))
    } else if (key.name === "backspace") {
      setQuery((q) => q.slice(0, -1))
      setSelectedIndex(0)
    } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      setQuery((q) => q + key.sequence)
      setSelectedIndex(0)
    }
  })

  if (!visible) return null

  return (
    <box
      width="100%"
      height="100%"
      position="absolute"
      top={0}
      left={0}
    >
      {/* Dim background */}
      <box
        width="100%"
        height="100%"
        position="absolute"
        top={0}
        left={0}
        backgroundColor={theme.overlayBg}
      />

      {/* Dialog */}
      <box
        position="absolute"
        top={2}
        left="25%"
        width="50%"
        height="70%"
        flexDirection="column"
        backgroundColor={theme.modalBg}
      >
        {/* Search input */}
        <box paddingLeft={2} paddingRight={2} paddingBottom={1} height={2}>
          <input
            value={query}
            placeholder={placeholder}
            focused
            backgroundColor={theme.modalBg}
            textColor={theme.text}
            placeholderColor={theme.textMuted}
            width="100%"
          />
        </box>

        {/* Scrollable results */}
        {filtered.length === 0 ? (
          <box paddingLeft={2} paddingBottom={1}>
            <text>
              <span fg={theme.textMuted}>No results</span>
            </text>
          </box>
        ) : (
          <scrollbox ref={scrollRef} flexGrow={1}>
            {filtered.map((cmd, i) => (
              <PaletteRow
                key={cmd.id}
                command={cmd}
                selected={i === selectedIndex}
              />
            ))}
          </scrollbox>
        )}
      </box>
    </box>
  )
}

function PaletteRow({ command, selected }: { command: Command; selected: boolean }) {
  return (
    <box
      flexDirection="row"
      justifyContent="space-between"
      backgroundColor={selected ? theme.selection : undefined}
      paddingLeft={2}
      paddingRight={2}
      width="100%"
    >
      <text>
        <span fg={selected ? theme.text : theme.textDim}>{command.label}</span>
      </text>
      {command.shortcut && (
        <text>
          <span fg={theme.textMuted}>{command.shortcut}</span>
        </text>
      )}
    </box>
  )
}
