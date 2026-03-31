/**
 * UriScreen — shown at startup when no --uri flag was provided.
 * Lets the user paste or type a MongoDB connection URI.
 *
 * Empty input + Enter connects to mongodb://localhost:27017.
 */

import { useState } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { theme } from "../theme"

const DEFAULT_URI = "mongodb://localhost:27017"

interface UriScreenProps {
  onConnect: (uri: string) => void
}

export function UriScreen({ onConnect }: UriScreenProps) {
  const renderer = useRenderer()
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)

  useKeyboard((key) => {
    if (key.name === "return") {
      const uri = value.trim() || DEFAULT_URI
      if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
        setError("URI must start with mongodb:// or mongodb+srv://")
        return
      }
      onConnect(uri)
      return
    }

    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      renderer.destroy()
      return
    }
  })

  return (
    <box flexGrow={1} flexDirection="column" alignItems="center" justifyContent="center">
      {/* Title */}
      <box marginBottom={1} flexDirection="column" alignItems="center">
        <text>
          <span fg={theme.primary}>
            <strong>monq</strong>
          </span>
          <span fg={theme.textDim}> — connect</span>
        </text>
      </box>

      {/* URI input */}
      <box minWidth={36} flexDirection="column" marginBottom={1}>
        <box>
          <text>
            <span fg={theme.textMuted}>{"─".repeat(36)}</span>
          </text>
        </box>
        <box flexDirection="row" paddingLeft={1} paddingRight={1}>
          <text>
            <span fg={theme.primary}>{"› "}</span>
          </text>
          <input
            value={value}
            onInput={(v) => {
              setValue(v)
              setError(null)
            }}
            placeholder={DEFAULT_URI}
            focused
            backgroundColor={theme.bg}
            textColor={theme.text}
            placeholderColor={theme.textMuted}
            cursorColor={theme.primary}
            width={32}
          />
        </box>
        <box>
          <text>
            <span fg={theme.textMuted}>{"─".repeat(36)}</span>
          </text>
        </box>
      </box>

      {/* Error / hint row */}
      <box marginTop={1}>
        <text>
          {error ? (
            <span fg={theme.error}>{error}</span>
          ) : (
            <span fg={theme.textMuted}>Enter to connect · Esc to quit</span>
          )}
        </text>
      </box>
    </box>
  )
}
