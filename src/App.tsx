/**
 * Main application component.
 * Thin composition — logic in hooks, display in components.
 */

import { useReducer, useMemo, useCallback, useState } from "react"
import { useRenderer } from "@opentui/react"
import { Shell } from "./components/Shell"
import { Header } from "./components/Header"
import { FilterBar, BsonSuggestions } from "./components/FilterBar"
import { Loading } from "./components/Loading"
import { ErrorView } from "./components/ErrorView"
import { DocumentList } from "./components/DocumentList"
import { DocumentPreview } from "./components/DocumentPreview"
import { FilterSuggestions } from "./components/FilterSuggestions"
import { CommandPalette } from "./components/CommandPalette"
import { TabBar } from "./components/TabBar"
import { appReducer, createInitialState } from "./state"
import { useMongoConnection } from "./hooks/useMongoConnection"
import { useKeyboardNav } from "./hooks/useKeyboardNav"
import { useDocumentLoader } from "./hooks/useDocumentLoader"
import { buildCommands } from "./commands/builder"
import { buildCollectionCommands } from "./commands/collections"
import { editDocument } from "./actions/edit"
import { disconnect, serializeDocument } from "./providers/mongodb"
import type { Command } from "./commands/types"

interface AppProps {
  uri: string
}

type PaletteMode = "commands" | "collections"

export function App({ uri }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, null, createInitialState)
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("commands")
  const renderer = useRenderer()

  useMongoConnection({ uri, dispatch })
  useKeyboardNav({ state, dispatch })
  useDocumentLoader({ state, dispatch })

  // Build palette commands based on mode
  const mainCommands = useMemo(() => buildCommands(state), [state])
  const collectionCommands = useMemo(
    () => buildCollectionCommands(state.collections),
    [state.collections],
  )

  const paletteCommands = paletteMode === "collections" ? collectionCommands : mainCommands
  const palettePlaceholder = paletteMode === "collections" ? "Switch collection..." : "Search commands..."

  const handlePaletteSelect = useCallback((cmd: Command) => {
    // Collection selection
    if (cmd.id.startsWith("open:")) {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      setPaletteMode("commands")
      dispatch({ type: "OPEN_TAB", collectionName: cmd.id.slice(5) })
      return
    }

    switch (cmd.id) {
      case "nav:switch-collection":
        setPaletteMode("collections")
        break
      case "doc:edit": {
        dispatch({ type: "CLOSE_COMMAND_PALETTE" })
        const doc = state.documents[state.selectedIndex]
        const tab = state.tabs.find((t) => t.id === state.activeTabId)
        if (doc && tab) {
          renderer.suspend()
          editDocument(tab.collectionName, doc)
            .finally(() => {
              renderer.resume()
              dispatch({ type: "RELOAD_DOCUMENTS" })
            })
        }
        break
      }
      case "doc:copy-json": {
        dispatch({ type: "CLOSE_COMMAND_PALETTE" })
        const doc = state.documents[state.selectedIndex]
        if (doc) {
          const json = serializeDocument(doc)
          // Copy to clipboard via OSC 52
          const b64 = btoa(json)
          process.stdout.write(`\x1b]52;c;${b64}\x07`)
          dispatch({ type: "SHOW_MESSAGE", message: "Copied to clipboard" })
        }
        break
      }
      case "doc:copy-id": {
        dispatch({ type: "CLOSE_COMMAND_PALETTE" })
        const doc = state.documents[state.selectedIndex]
        if (doc?._id) {
          const id = String(doc._id)
          const b64 = btoa(id)
          process.stdout.write(`\x1b]52;c;${b64}\x07`)
          dispatch({ type: "SHOW_MESSAGE", message: "Copied _id" })
        }
        break
      }
      case "doc:filter-value": {
        dispatch({ type: "CLOSE_COMMAND_PALETTE" })
        // Trigger the same logic as 'f' key — dispatch via keyboard nav
        // Simplify: just open the filter bar
        dispatch({ type: "OPEN_QUERY" })
        break
      }
      case "view:toggle-preview":
        dispatch({ type: "CLOSE_COMMAND_PALETTE" })
        dispatch({ type: "TOGGLE_PREVIEW" })
        break
      case "view:cycle-preview":
        dispatch({ type: "CLOSE_COMMAND_PALETTE" })
        dispatch({ type: "CYCLE_PREVIEW_POSITION" })
        break
      case "view:reload":
        dispatch({ type: "CLOSE_COMMAND_PALETTE" })
        dispatch({ type: "RELOAD_DOCUMENTS" })
        break
      case "query:open-filter":
        dispatch({ type: "CLOSE_COMMAND_PALETTE" })
        dispatch({ type: "OPEN_QUERY" })
        break
      case "query:open-filter-bson":
        dispatch({ type: "CLOSE_COMMAND_PALETTE" })
        dispatch({ type: "OPEN_QUERY_BSON" })
        break
      case "query:clear-filter":
        dispatch({ type: "CLOSE_COMMAND_PALETTE" })
        dispatch({ type: "CLEAR_QUERY" })
        break
      case "query:format-bson":
        dispatch({ type: "CLOSE_COMMAND_PALETTE" })
        dispatch({ type: "FORMAT_BSON_SECTION" })
        dispatch({ type: "OPEN_QUERY_BSON" })
        break
      case "query:sort": {
        dispatch({ type: "CLOSE_COMMAND_PALETTE" })
        const visCols = state.columns.filter((c) => c.visible)
        const sortCol = visCols[state.selectedColumnIndex]
        if (sortCol) {
          dispatch({ type: "CYCLE_SORT", field: sortCol.field })
        }
        break
      }
      default:
        dispatch({ type: "CLOSE_COMMAND_PALETTE" })
    }
  }, [state, renderer])

  const handlePaletteClose = useCallback(() => {
    if (paletteMode === "collections" && state.activeTabId) {
      // Go back to main commands
      setPaletteMode("commands")
    } else {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      setPaletteMode("commands")
    }
  }, [paletteMode, state.activeTabId])

  // Show palette automatically when no tab is open
  const paletteVisible = state.commandPaletteVisible ||
    (state.view === "collections" && !state.collectionsLoading && !state.error)

  // Auto-show collection picker when no tab is open
  const effectivePaletteMode = !state.activeTabId && paletteVisible ? "collections" : paletteMode
  const effectiveCommands = effectivePaletteMode === "collections" ? collectionCommands : mainCommands
  const effectivePlaceholder = effectivePaletteMode === "collections" ? "Switch collection..." : "Search commands..."

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
  const selectedDoc = state.documents[state.selectedIndex] ?? null

  return (
    <Shell>
      <Header
        dbName={state.dbName}
        host={state.host}
        collectionName={state.tabs.length === 1 ? activeTab?.collectionName : undefined}
        loading={state.collectionsLoading || state.documentsLoading}
        right={activeTab
          ? state.queryInput
            ? `${state.documentCount.toLocaleString()} / ${state.totalDocumentCount.toLocaleString()} docs`
            : `${state.documentCount.toLocaleString()} docs`
          : ""
        }
      />

      <TabBar tabs={state.tabs} activeTabId={state.activeTabId} />

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
              sortField={state.sortField}
              sortDirection={state.sortDirection}
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

      {/* Simple mode: field suggestions popup */}
      <FilterSuggestions
        visible={state.queryVisible && state.queryMode === "simple"}
        query={state.queryInput}
        queryMode={state.queryMode}
        columns={state.columns}
        schemaMap={state.schemaMap}
        onChange={(q) => dispatch({ type: "SET_QUERY_INPUT", input: q })}
      />

      {/* BSON mode: field name hints above the panel */}
      <BsonSuggestions
        visible={state.queryVisible && state.queryMode === "bson"}
        columns={state.columns}
        schemaMap={state.schemaMap}
      />

      <FilterBar
        query={state.queryInput}
        queryMode={state.queryMode}
        bsonSort={state.bsonSort}
        bsonProjection={state.bsonProjection}
        bsonFocusedSection={state.bsonFocusedSection}
        bsonSortVisible={state.bsonSortVisible}
        bsonProjectionVisible={state.bsonProjectionVisible}
        bsonExternalVersion={state.bsonExternalVersion}
        editing={state.queryVisible}
        columns={state.columns}
        schemaMap={state.schemaMap}
        onQueryChange={(q) => dispatch({ type: "SET_QUERY_INPUT", input: q })}
        onBsonSortChange={(v) => dispatch({ type: "SET_BSON_SORT", input: v })}
        onBsonProjectionChange={(v) => dispatch({ type: "SET_BSON_PROJECTION", input: v })}
        onSubmit={() => dispatch({ type: "SUBMIT_QUERY" })}
      />

      <CommandPalette
        key={effectivePaletteMode}
        visible={paletteVisible}
        commands={effectiveCommands}
        onSelect={handlePaletteSelect}
        onClose={handlePaletteClose}
        placeholder={effectivePlaceholder}
      />
    </Shell>
  )
}
