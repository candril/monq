/**
 * Create input dialog — prompts for a collection name.
 * Used for creating collections from the command palette.
 */

import { useState } from "react"
import { useKeyboard } from "@opentui/react"
import { theme } from "../theme"

interface CreateInputDialogProps {
  onConfirm: (name: string) => void
  onCancel: () => void
}

export function CreateInputDialog({ onConfirm, onCancel }: CreateInputDialogProps) {
  const [name, setName] = useState("")

  useKeyboard((key) => {
    if (key.name === "escape") {
      onCancel()
      return
    }
    if (key.name === "return") {
      if (!name.trim()) return
      onConfirm(name.trim())
      return
    }
  })

  const canConfirm = name.trim() !== ""

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
            <span fg={theme.primary}>Create Collection</span>
          </text>
        </box>
        <box flexDirection="column" paddingX={2} paddingY={1}>
          <text>
            <span fg={theme.textMuted}>Collection name:</span>
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
              width={40}
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
              {canConfirm ? "Enter create" : "Enter name to continue"}
            </span>
          </text>
        </box>
      </box>
    </box>
  )
}
