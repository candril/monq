/**
 * Main application component.
 * Thin composition — logic in hooks, display in components.
 */

import { useReducer, useMemo, useCallback } from "react"
import { Shell } from "./components/Shell"
import { Header } from "./components/Header"
import { FilterBar } from "./components/FilterBar"
import { Loading } from "./components/Loading"
import { ErrorView } from "./components/ErrorView"
import { DocumentList } from "./components/DocumentList"
import { DocumentPreview } from "./components/DocumentPreview"
import { CommandPalette } from "./components/CommandPalette"
import { appReducer, createInitialState } from "./state"
import { useMongoConnection } from "./hooks/useMongoConnection"
import { useKeyboardNav } from "./hooks/useKeyboardNav"
import { useDocumentLoader } from "./hooks/useDocumentLoader"
import { buildCollectionCommands } from "./commands/collections"
import type { Command } from "./commands/types"

interface AppProps {
  uri: string
}

export function App({ uri }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, null, createInitialState)

  useMongoConnection({ uri, dispatch })
  useKeyboardNav({ state, dispatch })
  useDocumentLoader({ state, dispatch })

  const paletteCommands = useMemo(
    () => buildCollectionCommands(state.collections),
    [state.collections],
  )

  const handlePaletteSelect = useCallback((cmd: Command) => {
    dispatch({ type: "CLOSE_COMMAND_PALETTE" })
    if (cmd.id.startsWith("open:")) {
      dispatch({ type: "OPEN_TAB", collectionName: cmd.id.slice(5) })
    }
  }, [])

  const handlePaletteClose = useCallback(() => {
    dispatch({ type: "CLOSE_COMMAND_PALETTE" })
  }, [])

  // Show palette automatically when no tab is open
  const paletteVisible = state.commandPaletteVisible ||
    (state.view === "collections" && !state.collectionsLoading && !state.error)

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
  const selectedDoc = state.documents[state.selectedIndex] ?? null

  return (
    <Shell>
      <Header
        dbName={state.dbName}
        host={state.host}
        loading={state.collectionsLoading || state.documentsLoading}
        right={activeTab ? `${state.documentCount.toLocaleString()} docs` : ""}
      />

      <box
        flexGrow={1}
        overflow="hidden"
        flexDirection={state.previewPosition === "bottom" ? "column" : "row"}
      >
        {state.error ? (
          <ErrorView message={state.error} />
        ) : state.collectionsLoading ? (
          <Loading message="Connecting to MongoDB..." />
        ) : activeTab ? (
          <box
            flexGrow={1}
            width={state.previewPosition === "right" ? "50%" : "100%"}
            height={state.previewPosition === "bottom" ? "50%" : "100%"}
            overflow="hidden"
          >
            <DocumentList
              documents={state.documents}
              columns={state.columns}
              selectedIndex={state.selectedIndex}
              selectedColumnIndex={state.selectedColumnIndex}
            />
          </box>
        ) : null}

        {activeTab && (
          <DocumentPreview
            document={selectedDoc}
            position={state.previewPosition}
            scrollOffset={state.previewScrollOffset}
          />
        )}
      </box>

      <FilterBar query={state.queryInput} mode={state.queryMode} editing={state.queryVisible} />

      <CommandPalette
        visible={paletteVisible}
        commands={paletteCommands}
        onSelect={handlePaletteSelect}
        onClose={handlePaletteClose}
        placeholder="Open collection..."
      />
    </Shell>
  )
}
