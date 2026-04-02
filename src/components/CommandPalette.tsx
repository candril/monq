/**
 * Generic Ctrl+P command palette with sections.
 * Fuzzy search, scrollable results, category headers.
 */

import { useState, useMemo, useEffect, useRef } from "react"
import { useKeyboard, useTerminalDimensions } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { Command } from "../commands/types"
import { CATEGORY_ORDER, type CommandCategory } from "../commands/types"
import { fuzzyFilter } from "../utils/fuzzy"
import { theme } from "../theme"

const SCROLL_MARGIN = 2

interface CommandPaletteProps {
  visible: boolean
  commands: Command[]
  onSelect: (command: Command) => void
  onClose: () => void
  onHighlight?: (command: Command | null) => void
  placeholder?: string
  title?: string
}

/** A renderable row — spacer, category header, or a command */
type PaletteItem =
  | { type: "spacer" }
  | { type: "header"; category: string }
  | { type: "command"; command: Command; globalIndex: number }

/** Group filtered commands by category and interleave headers.
 *  Each item maps to exactly one visual row so scroll positions are accurate. */
function buildPaletteItems(commands: Command[]): { items: PaletteItem[]; commandCount: number } {
  const groups = new Map<string, Command[]>()
  for (const cmd of commands) {
    const list = groups.get(cmd.category) ?? []
    list.push(cmd)
    groups.set(cmd.category, list)
  }

  const sortedCategories = [...groups.keys()].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a as CommandCategory)
    const bi = CATEGORY_ORDER.indexOf(b as CommandCategory)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  const items: PaletteItem[] = []
  let commandIndex = 0
  let first = true
  for (const category of sortedCategories) {
    // Blank line between sections (except before the first)
    if (!first) {
      items.push({ type: "spacer" })
    }
    first = false
    items.push({ type: "header", category })
    for (const cmd of groups.get(category)!) {
      items.push({ type: "command", command: cmd, globalIndex: commandIndex++ })
    }
  }
  // Trailing spacer so the last row doesn't sit flush against the bottom edge
  if (items.length > 0) {
    items.push({ type: "spacer" })
  }
  return { items, commandCount: commandIndex }
}

/** Pretty category label */
function categoryLabel(category: string): string {
  switch (category) {
    case "navigation":
      return "Navigation"
    case "document":
      return "Document"
    case "view":
      return "View"
    case "query":
      return "Query"
    case "collection":
      return "Collections"
    default:
      return category.charAt(0).toUpperCase() + category.slice(1)
  }
}

export function CommandPalette({
  visible,
  commands,
  onSelect,
  onClose,
  onHighlight,
  placeholder = "Search...",
  title = "Commands",
}: CommandPaletteProps) {
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const { height: terminalHeight } = useTerminalDimensions()

  // Concrete pixel dimensions so the scrollbox gets a real bounded height.
  // Modal: 70% of terminal, offset 2 rows from top.
  // Fixed rows: spacer (1) + title (1) + spacer (1) + input (2) = 5.
  const modalHeight = Math.floor(terminalHeight * 0.7)
  const scrollboxHeight = Math.max(4, modalHeight - 5)

  useEffect(() => {
    if (visible) {
      setQuery("")
      setSelectedIndex(0)
    } else {
      onHighlight?.(null)
    }
  }, [visible, onHighlight])

  const filtered = useMemo(
    () => fuzzyFilter(query, commands, (cmd) => [cmd.label, cmd.category]),
    [query, commands],
  )

  const { items, commandCount } = useMemo(() => buildPaletteItems(filtered), [filtered])

  useEffect(() => {
    if (selectedIndex >= commandCount) {
      setSelectedIndex(Math.max(0, commandCount - 1))
    }
  }, [commandCount, selectedIndex])

  // Fire onHighlight whenever the highlighted command changes
  useEffect(() => {
    if (!visible || !onHighlight) {
      return
    }
    const selected = items.find((it) => it.type === "command" && it.globalIndex === selectedIndex)
    onHighlight(selected?.type === "command" ? selected.command : null)
  }, [selectedIndex, visible, items, onHighlight])

  // Auto-scroll: need to map selectedIndex to visual row
  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox) {
      return
    }

    // Find the visual row for the selected command
    const visualRow = items.findIndex(
      (item) => item.type === "command" && item.globalIndex === selectedIndex,
    )
    if (visualRow === -1) {
      return
    }

    const viewportHeight = scrollbox.viewport?.height ?? 20
    const scrollTop = scrollbox.scrollTop
    const scrollBottom = scrollTop + viewportHeight

    if (visualRow < scrollTop + SCROLL_MARGIN) {
      scrollbox.scrollTo(Math.max(0, visualRow - SCROLL_MARGIN))
    } else if (visualRow >= scrollBottom - SCROLL_MARGIN) {
      // Scroll just enough to keep the row visible, but never beyond the
      // last item so the scrollbar correctly reaches the bottom.
      const maxScroll = Math.max(0, items.length - viewportHeight)
      const target = visualRow - viewportHeight + SCROLL_MARGIN + 1
      scrollbox.scrollTo(Math.min(target, maxScroll))
    }
  }, [selectedIndex, items])

  useKeyboard((key) => {
    if (!visible) {
      return
    }

    if (key.name === "escape") {
      onHighlight?.(null)
      onClose()
    } else if (key.name === "return") {
      const selected = items.find((it) => it.type === "command" && it.globalIndex === selectedIndex)
      if (selected?.type === "command") {
        onSelect(selected.command)
      }
    } else if (
      key.name === "up" ||
      (key.ctrl && key.name === "p") ||
      (key.ctrl && key.name === "k")
    ) {
      setSelectedIndex((i) => Math.max(0, i - 1))
    } else if (
      key.name === "down" ||
      (key.ctrl && key.name === "n") ||
      (key.ctrl && key.name === "j")
    ) {
      setSelectedIndex((i) => Math.min(commandCount - 1, i + 1))
    } else if (key.ctrl && key.name === "w") {
      setQuery((q) => q.replace(/\S+\s*$/, ""))
      setSelectedIndex(0)
    } else if (key.name === "backspace") {
      setQuery((q) => q.slice(0, -1))
      setSelectedIndex(0)
    } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      setQuery((q) => q + key.sequence)
      setSelectedIndex(0)
    }
  })

  if (!visible) {
    return null
  }

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
        left="25%"
        width="50%"
        height={modalHeight}
        flexDirection="column"
        backgroundColor={theme.modalBg}
      >
        <box height={1} />
        <box height={1} paddingLeft={2}>
          <text>
            <span fg={theme.primary}>{title}</span>
          </text>
        </box>
        <box height={1} />
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

        {commandCount === 0 ? (
          <box paddingLeft={2} paddingBottom={1}>
            <text>
              <span fg={theme.textMuted}>No results</span>
            </text>
          </box>
        ) : (
          <scrollbox ref={scrollRef} height={scrollboxHeight}>
            {items.map((item, i) => {
              if (item.type === "spacer") {
                return <box key={`s-${i}`} height={1} />
              }
              if (item.type === "header") {
                return (
                  <box key={`h-${item.category}`} paddingLeft={2} height={1}>
                    <text>
                      <span fg={theme.secondary}>{categoryLabel(item.category)}</span>
                    </text>
                  </box>
                )
              }
              return (
                <PaletteRow
                  key={item.command.id}
                  command={item.command}
                  selected={item.globalIndex === selectedIndex}
                />
              )
            })}
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
      paddingLeft={3}
      paddingRight={2}
      width="100%"
    >
      <text>
        <span fg={selected ? theme.text : theme.textDim}>{command.label}</span>
      </text>
      {command.shortcut && (
        <text>
          <span fg={selected ? theme.textDim : theme.textMuted}>{command.shortcut}</span>
        </text>
      )}
    </box>
  )
}
