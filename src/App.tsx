/**
 * Main application component
 */

import { useReducer, useEffect, useCallback } from "react"
import { useRenderer } from "@opentui/react"
import { useKeyboard } from "@opentui/react"
import { Shell } from "./components/Shell"
import { Header } from "./components/Header"
import { FilterBar } from "./components/FilterBar"
import { Loading } from "./components/Loading"
import { theme } from "./theme"
import { appReducer, createInitialState } from "./state"
import {
  connect,
  disconnect,
  listCollections,
} from "./providers/mongodb"

interface AppProps {
  uri: string
}

export function App({ uri }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, null, createInitialState)
  const renderer = useRenderer()

  // Connect to MongoDB on mount
  useEffect(() => {
    connect(uri)
      .then(({ dbName, host }) => {
        dispatch({ type: "SET_CONNECTION_INFO", dbName, host })
        return listCollections()
      })
      .then((collections) => {
        dispatch({ type: "SET_COLLECTIONS", collections })
      })
      .catch((err) => {
        dispatch({ type: "SET_ERROR", error: err.message })
      })
  }, [uri])

  // Keyboard handling
  useKeyboard((key) => {
    // Quit
    if (key.name === "q" && !state.queryVisible && !state.commandPaletteVisible) {
      disconnect().finally(() => renderer.destroy())
      return
    }

    // Command palette
    if (key.ctrl && key.name === "p") {
      dispatch({ type: "OPEN_COMMAND_PALETTE" })
      return
    }

    // Collection browser navigation
    if (state.view === "collections" && !state.queryVisible && !state.commandPaletteVisible) {
      if (key.name === "j" || key.name === "down") {
        dispatch({ type: "MOVE_COLLECTION", delta: 1 })
      } else if (key.name === "k" || key.name === "up") {
        dispatch({ type: "MOVE_COLLECTION", delta: -1 })
      } else if (key.name === "return") {
        const col = state.collections[state.collectionSelectedIndex]
        if (col) {
          dispatch({ type: "OPEN_TAB", collectionName: col.name })
        }
      }
    }

    // Document view navigation
    if (state.view === "documents" && !state.queryVisible && !state.commandPaletteVisible) {
      if (key.name === "j" || key.name === "down") {
        dispatch({ type: "MOVE_DOCUMENT", delta: 1 })
      } else if (key.name === "k" || key.name === "up") {
        dispatch({ type: "MOVE_DOCUMENT", delta: -1 })
      } else if (key.name === "p") {
        dispatch({ type: "TOGGLE_PREVIEW" })
      } else if (key.shift && key.name === "p") {
        dispatch({ type: "CYCLE_PREVIEW_POSITION" })
      } else if (key.name === "escape") {
        // Go back to collection browser
        dispatch({ type: "SET_VIEW", view: "collections" })
      }
    }

    // Query bar
    if (key.name === "/" && !state.queryVisible && !state.commandPaletteVisible && state.view === "documents") {
      dispatch({ type: "OPEN_QUERY" })
    }
  })

  // Header right info
  const headerRight = state.view === "collections"
    ? `${state.collections.length} collections`
    : state.view === "documents"
      ? `${state.documentCount.toLocaleString()} docs`
      : ""

  return (
    <Shell>
      <Header
        dbName={state.dbName}
        host={state.host}
        loading={state.collectionsLoading || state.documentsLoading}
        right={headerRight}
      />

      {/* Main content area */}
      <box flexGrow={1} overflow="hidden">
        {state.error ? (
          <box flexGrow={1} justifyContent="center" alignItems="center" flexDirection="column">
            <text>
              <span fg={theme.error}>Error: {state.error}</span>
            </text>
            <text>
              <span fg={theme.textDim}>Check your --uri and try again</span>
            </text>
          </box>
        ) : state.collectionsLoading ? (
          <Loading message="Connecting to MongoDB..." />
        ) : state.view === "collections" ? (
          <box flexGrow={1} flexDirection="column" paddingX={1}>
            {state.collections.map((col, i) => {
              const selected = i === state.collectionSelectedIndex
              return (
                <box key={col.name} height={1} backgroundColor={selected ? theme.selection : undefined}>
                  <text>
                    <span fg={selected ? theme.primary : theme.text}>
                      {selected ? "> " : "  "}
                      {col.name.padEnd(30)}
                    </span>
                    <span fg={theme.textDim}>
                      {col.documentCount.toLocaleString().padStart(10)} docs
                    </span>
                  </text>
                </box>
              )
            })}
          </box>
        ) : state.view === "documents" ? (
          <box flexGrow={1} justifyContent="center" alignItems="center">
            {state.documentsLoading ? (
              <Loading message="Loading documents..." />
            ) : (
              <text>
                <span fg={theme.textDim}>
                  {state.tabs.find((t) => t.id === state.activeTabId)?.collectionName ?? ""}
                  {" "}- {state.documentCount} documents (document list coming in spec 003)
                </span>
              </text>
            )}
          </box>
        ) : null}
      </box>

      {/* Filter bar - only when query is active */}
      <FilterBar
        query={state.queryInput}
        mode={state.queryMode}
        editing={state.queryVisible}
      />
    </Shell>
  )
}
