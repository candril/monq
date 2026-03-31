/**
 * Rename input dialog — prompts for a new name.
 * Pre-filled with the current name for easy editing.
 */

import { useState } from "react"
import { useKeyboard } from "@opentui/react"
import { theme } from "../theme"

interface RenameInputDialogProps {
  type: "collection"
  oldName: string
  onConfirm: (newName: string) => void
  onCancel: () => void
}

export function RenameInputDialog({ type, oldName, onConfirm, onCancel }: RenameInputDialogProps) {
  const [name, setName] = useState(oldName)

  useKeyboard((key) => {
    if (key.name === "escape") {
      onCancel()
      return
    }
    if (key.name === "return") {
      const trimmed = name.trim()
      if (!trimmed || trimmed === oldName) return
      onConfirm(trimmed)
      return
    }
  })

  const trimmed = name.trim()
  const canConfirm = trimmed !== "" && trimmed !== oldName

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={300}
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
      <box minWidth={72} maxWidth="90%" flexDirection="column" backgroundColor={theme.modalBg}>
        <box paddingX={2} paddingY={1} backgroundColor={theme.headerBg}>
          <text>
            <span fg={theme.primary}>
              Rename {type === "collection" ? "Collection" : "Database"}
            </span>
          </text>
        </box>
        <box flexDirection="column" paddingX={2} paddingY={1}>
          <text>
            <span fg={theme.textMuted}>Current name: </span>
            <span fg={theme.text}>{oldName}</span>
          </text>
          <text>
            <span fg={theme.textMuted}>New name:</span>
          </text>
          <box flexDirection="row" paddingLeft={1}>
            <text>
              <span fg={theme.primary}>{"> "}</span>
            </text>
            <input
              value={name}
              onInput={setName}
              focused
              backgroundColor={theme.bg}
              textColor={theme.text}
              cursorColor={theme.primary}
              width={Math.max(40, oldName.length + 10)}
            />
          </box>
        </box>
        <box
          paddingX={2}
          paddingTop={1}
          paddingBottom={1}
          backgroundColor={theme.headerBg}
          flexDirection="column"
        >
          <text>
            <span fg={theme.textMuted}>Esc cancel · </span>
            <span fg={canConfirm ? theme.primary : theme.textMuted}>
              {canConfirm ? "Enter rename" : "Enter a new name"}
            </span>
          </text>
        </box>
      </box>
    </box>
  )
}
