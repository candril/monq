/**
 * Drop confirmation dialog — requires typing the exact name to confirm.
 * Used for dropping collections and databases.
 */

import { useState } from "react"
import { useKeyboard } from "@opentui/react"
import { theme } from "../theme"

interface DropConfirmDialogProps {
  type: "collection" | "database"
  name: string
  onConfirm: () => void
  onCancel: () => void
}

export function DropConfirmDialog({ type, name, onConfirm, onCancel }: DropConfirmDialogProps) {
  const [input, setInput] = useState("")

  useKeyboard((key) => {
    if (key.name === "escape") {
      onCancel()
      return
    }
    if (key.name === "return") {
      if (input === name) {
        onConfirm()
      }
      return
    }
  })

  const canConfirm = input === name

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={200}
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
            <span fg={theme.error}>Drop {type === "collection" ? "Collection" : "Database"}</span>
          </text>
        </box>
        <box flexDirection="column" paddingX={2} paddingY={1} gap={1}>
          <text>
            <span fg={theme.text}>
              Are you sure you want to drop {type === "collection" ? "collection" : "database"}{" "}
            </span>
            <span fg={theme.error}>
              <strong>{name}</strong>
            </span>
            <span fg={theme.text}>?</span>
          </text>
          {type === "database" && (
            <text>
              <span fg={theme.warning}>This will delete all collections in this database.</span>
            </text>
          )}
          <box marginTop={1}>
            <text>
              <span fg={theme.textMuted}>Type </span>
              <span fg={theme.text}>{name}</span>
              <span fg={theme.textMuted}> to confirm:</span>
            </text>
          </box>
          <box flexDirection="row" paddingLeft={1} marginTop={1}>
            <text>
              <span fg={theme.primary}>{"> "}</span>
            </text>
            <input
              value={input}
              onInput={setInput}
              focused
              backgroundColor={theme.bg}
              textColor={theme.text}
              cursorColor={theme.primary}
              width={Math.max(32, name.length + 4)}
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
            <span fg={canConfirm ? theme.error : theme.textMuted}>
              {canConfirm ? "Enter confirm" : "Type name to confirm"}
            </span>
          </text>
        </box>
      </box>
    </box>
  )
}
