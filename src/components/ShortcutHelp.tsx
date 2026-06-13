import { useKeyboard } from "@opentui/react"
import type { ActionName, Keymap } from "../config/types"
import { theme } from "../theme"
import { hintFor, matches } from "../utils/keymap"

interface ShortcutHelpProps {
  visible: boolean
  keymap: Keymap
  onClose: () => void
}

type ShortcutItem = [action: ActionName, label: string]

const GROUPS: Array<[title: string, items: ShortcutItem[]]> = [
  [
    "Move",
    [
      ["nav.up", "previous row"],
      ["nav.down", "next row"],
      ["nav.first_row", "first row"],
      ["nav.last_row", "last loaded row"],
      ["nav.left", "previous column"],
      ["nav.right", "next column"],
      ["nav.first_column", "first column"],
      ["nav.last_column", "last column"],
      ["nav.center_row", "center row"],
    ],
  ],
  [
    "Sidebar",
    [
      ["sidebar.focus", "focus sidebar"],
      ["sidebar.blur", "return to documents"],
      ["sidebar.toggle", "toggle sidebar"],
      ["collection.select_prev", "previous selected collection"],
      ["collection.select_next", "next selected collection"],
      ["collection.peek_prev", "peek previous collection"],
      ["collection.peek_next", "peek next collection"],
    ],
  ],
  [
    "Documents",
    [
      ["doc.filter_value", "filter selected value"],
      ["doc.yank_cell", "yank cell"],
      ["doc.yank_document", "yank document"],
      ["doc.edit", "edit document"],
      ["doc.insert", "insert document"],
      ["doc.delete", "delete tab/row"],
      ["doc.sort", "sort column"],
    ],
  ],
  [
    "View",
    [
      ["query.open", "query"],
      ["pipeline.open", "pipeline"],
      ["preview.toggle", "preview"],
      ["doc.open_preview_tmux", "tmux preview"],
      ["palette.open", "commands"],
      ["help.shortcuts", "shortcuts"],
      ["app.quit", "quit"],
    ],
  ],
]

export function ShortcutHelp({ visible, keymap, onClose }: ShortcutHelpProps) {
  useKeyboard((key) => {
    if (!visible) {
      return
    }
    if (
      key.name === "escape" ||
      matches(key, keymap["help.shortcuts"]) ||
      matches(key, keymap["app.quit"])
    ) {
      onClose()
    }
  })

  if (!visible) {
    return null
  }

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={220}
      justifyContent="center"
      alignItems="center"
    >
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        backgroundColor={theme.overlayBg}
      />
      <box minWidth={74} maxWidth="92%" flexDirection="column" backgroundColor={theme.modalBg}>
        <box paddingX={2} paddingY={1} backgroundColor={theme.headerBg} flexDirection="row">
          <text>
            <span fg={theme.primary}>Keyboard shortcuts</span>
            <span fg={theme.textMuted}> Esc/?/q closes</span>
          </text>
        </box>
        <box paddingX={2} paddingY={1} flexDirection="row" gap={4} flexWrap="wrap">
          {GROUPS.map(([title, items]) => (
            <box key={title} width={34} flexDirection="column" flexShrink={0}>
              <box paddingBottom={1}>
                <text>
                  <span fg={theme.secondary}>{title}</span>
                </text>
              </box>
              {items.map(([action, label]) => (
                <box key={action} flexDirection="row" height={1}>
                  <box width={10}>
                    <text>
                      <span fg={theme.text}>{hintFor(keymap, action)}</span>
                    </text>
                  </box>
                  <text>
                    <span fg={theme.textDim}>{label}</span>
                  </text>
                </box>
              ))}
            </box>
          ))}
        </box>
      </box>
    </box>
  )
}
