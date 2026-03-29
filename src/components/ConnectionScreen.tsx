/**
 * ConnectionScreen — shown at startup when saved connection profiles exist.
 *
 * Mirrors the WelcomeScreen interaction model:
 *   - Search input always focused at the top
 *   - Type to fuzzy-filter the list below
 *   - ↑/↓, Ctrl-p/n, Ctrl-k/j → move selection
 *   - Enter → connect to selected profile
 *   - Tab → switch to inline custom URI input
 *   - Backspace on empty (URI mode) → back to profile list
 *   - Esc / q (empty query) → quit
 *
 * For uri_cmd profiles the command is exec'd on Enter; a spinner is shown
 * while resolving. Errors are displayed inline.
 */

import { useState, useMemo, useEffect } from "react"
import { useKeyboard, useRenderer } from "@opentui/react"
import { fuzzyFilter } from "../utils/fuzzy"
import { theme } from "../theme"
import { Loading } from "./Loading"
import type { ConnectionProfile } from "../config/connections"
import { profileHint } from "../config/connections"
import { resolveUri } from "../utils/resolveUri"
import { randomConnectionMessage } from "../utils/loadingMessages"

const MIN_LIST_HEIGHT = 8
const DEFAULT_URI = "mongodb://localhost:27017"

interface ConnectionScreenProps {
  profiles: ConnectionProfile[]
  onConnect: (uri: string) => void
}

type Mode = "list" | "uri" | "resolving"

export function ConnectionScreen({ profiles, onConnect }: ConnectionScreenProps) {
  const renderer = useRenderer()
  const [mode, setMode] = useState<Mode>("list")
  const [query, setQuery] = useState("")
  const [cursor, setCursor] = useState(0)
  const [uriValue, setUriValue] = useState("")
  const [uriError, setUriError] = useState<string | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [resolvingName, setResolvingName] = useState("")
  const [loadingMessage, setLoadingMessage] = useState("")

  // Cycle loading messages while resolving
  useEffect(() => {
    if (mode !== "resolving") return
    setLoadingMessage(randomConnectionMessage())
    const timer = setInterval(() => setLoadingMessage(randomConnectionMessage()), 5000)
    return () => clearInterval(timer)
  }, [mode])

  const filtered = useMemo(
    () => (query ? fuzzyFilter(query, profiles, (p) => [p.name]) : profiles),
    [query, profiles],
  )

  const safeCursor = Math.min(cursor, Math.max(0, filtered.length - 1))

  useEffect(() => {
    setCursor(0)
  }, [query])

  const connectProfile = async (profile: ConnectionProfile) => {
    if (profile.uri) {
      onConnect(profile.uri)
      return
    }
    setResolvingName(profile.name)
    setMode("resolving")
    try {
      const uri = await resolveUri(profile)
      onConnect(uri)
    } catch (err) {
      setResolveError(err instanceof Error ? err.message : String(err))
      setMode("list")
    }
  }

  useKeyboard((key) => {
    if (mode === "resolving") return

    if (mode === "uri") {
      if (key.name === "tab") {
        setMode("list")
        setUriError(null)
        return
      }
      if (key.name === "return") {
        const uri = uriValue.trim() || DEFAULT_URI
        if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
          setUriError("URI must start with mongodb:// or mongodb+srv://")
          return
        }
        onConnect(uri)
        return
      }

      if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        renderer.destroy()
        return
      }
      return
    }

    // list mode
    if (key.name === "up" || (key.ctrl && key.name === "p") || (key.ctrl && key.name === "k")) {
      setCursor((c) => Math.max(0, c - 1))
      return
    }
    if (key.name === "down" || (key.ctrl && key.name === "n") || (key.ctrl && key.name === "j")) {
      setCursor((c) => Math.min(filtered.length - 1, c + 1))
      return
    }
    if (key.name === "return") {
      const profile = filtered[safeCursor]
      if (profile) connectProfile(profile)
      return
    }
    if (key.name === "tab") {
      setMode("uri")
      setUriError(null)
      setResolveError(null)
      return
    }
    if (key.name === "escape") {
      renderer.destroy()
      return
    }
  })

  // Full-screen loading while fetching credentials
  if (mode === "resolving") {
    return <Loading message={loadingMessage || `Connecting to ${resolvingName}…`} />
  }

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

      {/* Step title — fixed text, no mode-dependent content to avoid layout shifts */}
      <box marginBottom={1}>
        <text>
          <span fg={theme.text}>Select a connection</span>
        </text>
      </box>

      {/* Input — always the same size; switches between filter and URI */}
      <box minWidth={36} flexDirection="column" marginBottom={1}>
        <box>
          <text>
            <span fg={theme.textMuted}>{"─".repeat(36)}</span>
          </text>
        </box>
        <box flexDirection="row" paddingLeft={1} paddingRight={1}>
          <text>
            <span fg={theme.textDim}>{"> "}</span>
          </text>
          <input
            value={mode === "uri" ? uriValue : query}
            onInput={(v) => {
              if (mode === "uri") {
                setUriValue(v)
                setUriError(null)
              } else setQuery(v)
            }}
            placeholder={mode === "uri" ? DEFAULT_URI : "type to filter..."}
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

      {/* Profile list — always rendered at fixed height to avoid layout shifts */}
      <box flexDirection="column" minWidth={36} minHeight={MIN_LIST_HEIGHT}>
        {mode === "uri" ? null : filtered.length === 0 ? (
          <box paddingLeft={2} paddingTop={1}>
            <text>
              <span fg={theme.textMuted}>No matches</span>
            </text>
          </box>
        ) : (
          filtered.map((profile, i) => {
            const isSelected = i === safeCursor
            return (
              <box
                key={profile.key}
                flexDirection="row"
                paddingLeft={2}
                paddingRight={2}
                backgroundColor={isSelected ? theme.selection : undefined}
              >
                <text>
                  <span fg={isSelected ? theme.text : theme.textDim}>{profile.name}</span>
                  {profile.uri ? (
                    <span fg={isSelected ? theme.textDim : theme.textMuted}>
                      {"  " + profileHint(profile)}
                    </span>
                  ) : (
                    ""
                  )}
                </text>
              </box>
            )
          })
        )}
      </box>

      {/* Error — fixed height so it doesn't shift layout */}
      <box marginTop={1} minHeight={1} minWidth={36}>
        {resolveError && (
          <text>
            <span fg={theme.error}>{resolveError}</span>
          </text>
        )}
        {uriError && (
          <text>
            <span fg={theme.error}>{uriError}</span>
          </text>
        )}
      </box>

      {/* Hint */}
      <box marginTop={1}>
        <text>
          <span fg={theme.textMuted}>
            {mode === "uri" ? "Tab to list  ·  Esc quit" : "Tab to enter URI  ·  Esc quit"}
          </span>
        </text>
      </box>
    </box>
  )
}
