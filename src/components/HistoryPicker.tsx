/**
 * History picker — suggestion-style overlay above the filter bar.
 * Triggered by Ctrl-Y while the simple query bar is open.
 * Ctrl-P / Ctrl-N to navigate, Enter to pick, Escape to dismiss.
 */

import { useState, useEffect } from "react"
import { useKeyboard } from "@opentui/react"
import { theme } from "../theme"

const MAX_VISIBLE = 8

interface HistoryPickerProps {
  entries: string[]
  onPick: (entry: string) => void
  onClose: () => void
}

export function HistoryPicker({ entries, onPick, onClose }: HistoryPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  // Reset selection when entries change
  useEffect(() => {
    setSelectedIndex(0)
  }, [entries.length])

  useKeyboard((key) => {
    if (key.name === "escape") {
      onClose()
      return
    }
    if (key.ctrl && key.name === "p") {
      setSelectedIndex((i) => Math.max(0, i - 1))
      return
    }
    if (key.ctrl && key.name === "n") {
      setSelectedIndex((i) => Math.min(entries.length - 1, i + 1))
      return
    }
    if (key.name === "return") {
      const entry = entries[selectedIndex]
      if (entry) onPick(entry)
      return
    }
    // Ctrl-Y again toggles closed
    if (key.ctrl && key.name === "y") {
      onClose()
      return
    }
  })

  if (entries.length === 0) {
    return (
      <box position="absolute" bottom={1} left={0} width="100%">
        <box backgroundColor={theme.headerBg} paddingLeft={2} paddingRight={1} height={1}>
          <text>
            <span fg={theme.textMuted}>no history yet</span>
          </text>
        </box>
      </box>
    )
  }

  const visible = entries.slice(0, MAX_VISIBLE)

  return (
    <box position="absolute" bottom={1} left={0} width="100%" flexDirection="column">
      <box backgroundColor={theme.headerBg} flexDirection="column" paddingLeft={1} paddingRight={1}>
        {visible.map((entry, i) => {
          const selected = i === selectedIndex
          return (
            <box
              key={entry}
              height={1}
              backgroundColor={selected ? theme.selection : undefined}
              paddingLeft={1}
              flexDirection="row"
              justifyContent="space-between"
            >
              <text>
                <span fg={selected ? theme.primary : theme.text}>{entry}</span>
              </text>
              {selected && (
                <text>
                  <span fg={theme.textMuted}>↵ pick</span>
                </text>
              )}
            </box>
          )
        })}
      </box>
    </box>
  )
}
