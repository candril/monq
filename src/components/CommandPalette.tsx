/**
 * Generic Ctrl+P command palette.
 * Fuzzy search over a list of commands, grouped by category.
 */

import { useState, useMemo, useEffect } from "react"
import { useKeyboard } from "@opentui/react"
import type { Command } from "../commands/types"
import { fuzzyFilter } from "../utils/fuzzy"
import { theme } from "../theme"

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

  // Group by category (preserving filter order within each group)
  const grouped = useMemo(() => {
    const map = new Map<string, Command[]>()
    for (const cmd of filtered) {
      const list = map.get(cmd.category) ?? []
      list.push(cmd)
      map.set(cmd.category, list)
    }
    return map
  }, [filtered])

  // Keyboard handling
  useKeyboard((key) => {
    if (!visible) return

    if (key.name === "escape") {
      onClose()
    } else if (key.name === "return") {
      if (filtered[selectedIndex]) {
        onSelect(filtered[selectedIndex])
      }
    } else if (key.name === "up" || (key.ctrl && key.name === "p")) {
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (key.name === "down" || (key.ctrl && key.name === "n")) {
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

        {/* Results */}
        <box flexDirection="column" paddingBottom={1}>
          {filtered.length === 0 ? (
            <box paddingLeft={2}>
              <text>
                <span fg={theme.textMuted}>No results</span>
              </text>
            </box>
          ) : (
            [...grouped.entries()].map(([category, cmds]) => (
              <box key={category} flexDirection="column">
                {/* Category header */}
                <box paddingLeft={2} paddingTop={1}>
                  <text>
                    <span fg={theme.secondary}>{category.toUpperCase()}</span>
                  </text>
                </box>
                {/* Commands */}
                {cmds.map((cmd) => {
                  const globalIndex = filtered.indexOf(cmd)
                  const selected = globalIndex === selectedIndex
                  return (
                    <PaletteRow
                      key={cmd.id}
                      command={cmd}
                      selected={selected}
                    />
                  )
                })}
              </box>
            ))
          )}
        </box>
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
