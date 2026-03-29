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
      {/* Brand */}
      <box marginBottom={1} flexDirection="column" alignItems="center">
        <text>
          <span fg={theme.primary}>
            <strong>Monq</strong>
          </span>
        </text>
        <text>
          <span fg={theme.textDim}>MongoDB browser</span>
        </text>
      </box>

      {/* Prompt */}
      <box marginBottom={1}>
        <text>
          <span fg={theme.text}>Enter your connection URI</span>
        </text>
      </box>

      {/* Input box */}
      <box flexDirection="column" minWidth={52}>
        <box>
          <text>
            <span fg={theme.textMuted}>{"─".repeat(52)}</span>
          </text>
        </box>
        <box flexDirection="row" paddingLeft={1} paddingRight={1}>
          <text>
            <span fg={theme.textDim}>{"> "}</span>
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
            width={48}
          />
        </box>
        <box>
          <text>
            <span fg={theme.textMuted}>{"─".repeat(52)}</span>
          </text>
        </box>
      </box>

      {/* Error */}
      <box marginTop={1} minHeight={1}>
        {error && (
          <text>
            <span fg={theme.error}>{error}</span>
          </text>
        )}
      </box>

      {/* Hint */}
      <box marginTop={1}>
        <text>
          <span fg={theme.textMuted}>Enter to connect · Esc to quit</span>
        </text>
      </box>
    </box>
  )
}
