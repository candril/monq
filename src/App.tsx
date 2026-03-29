/**
 * Main application component.
 * Thin composition — logic in hooks, display in components.
 */

import { useReducer, useMemo, useCallback, useState, useRef, useEffect } from "react"
import { useRenderer, useTerminalDimensions } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { Shell } from "./components/Shell"
import { Header } from "./components/Header"
import { FilterBar } from "./components/FilterBar"
import { PipelineBar } from "./components/PipelineBar"
import { PipelineConfirmDialog } from "./components/PipelineConfirmDialog"
import { BulkEditConfirmDialog } from "./components/BulkEditConfirmDialog"
import { DeleteConfirmDialog } from "./components/DeleteConfirmDialog"
import { Toast } from "./components/Toast"
import { Loading } from "./components/Loading"
import { ErrorView } from "./components/ErrorView"
import { DocumentList } from "./components/DocumentList"
import { DocumentPreview } from "./components/DocumentPreview"
import { FilterSuggestions } from "./components/FilterSuggestions"
import { HistoryPicker } from "./components/HistoryPicker"
import { CommandPalette } from "./components/CommandPalette"
import { WelcomeScreen } from "./components/WelcomeScreen"
import { TabBar } from "./components/TabBar"
import { appReducer, createInitialState } from "./state"
import { useMongoConnection } from "./hooks/useMongoConnection"
import { useKeyboardNav } from "./hooks/useKeyboardNav"
import { useDocumentLoader } from "./hooks/useDocumentLoader"
import { buildCommands } from "./commands/builder"
import { loadHistory, appendHistory } from "./utils/history"
import { buildCollectionCommands } from "./commands/collections"
import { buildDatabaseCommands } from "./commands/databases"
import { usePaletteActions } from "./hooks/usePaletteActions"
import { formatDocumentCount, resolveSortField, resolveSortDirection } from "./utils/format"

type PaletteMode = "commands" | "collections" | "databases"

interface AppProps {
  uri: string
  onBackToUri?: () => void
}

export function App({ uri, onBackToUri }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, null, createInitialState)
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("commands")
  const renderer = useRenderer()
  const { height: terminalHeight } = useTerminalDimensions()
  const docListScrollRef = useRef<ScrollBoxRenderable>(null)

  const pageSize = terminalHeight + 10

  // Load query history from disk once on mount
  useEffect(() => {
    loadHistory().then((entries) => dispatch({ type: "LOAD_HISTORY", entries }))
  }, [])

  // Append to history whenever a non-empty simple query is submitted.
  // Also update in-memory historyEntries so Ctrl-K/J works within the same session.
  const prevReloadCounter = useRef(state.reloadCounter)
  useEffect(() => {
    if (prevReloadCounter.current === state.reloadCounter) return
    prevReloadCounter.current = state.reloadCounter
    if (state.queryMode === "simple" && state.queryInput.trim()) {
      const query = state.queryInput.trim()
      appendHistory(query)
      dispatch({ type: "APPEND_HISTORY_ENTRY", entry: query })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.reloadCounter])

  useMongoConnection({ uri, dispatch, dbName: state.dbName })
  const { pipelineFocusedIndex, bulkEditFocusedIndex, deleteFocusedIndex } = useKeyboardNav({
    state,
    dispatch,
    docListScrollRef,
  })
  useDocumentLoader({ state, dispatch, pageSize })

  // Build palette commands based on mode (for in-app switching via Ctrl+P)
  const mainCommands = useMemo(() => buildCommands(state), [state])
  const collectionCommands = useMemo(
    () => buildCollectionCommands(state.collections),
    [state.collections],
  )
  const databaseCommands = useMemo(
    () => buildDatabaseCommands(state.databases, state.dbName || undefined),
    [state.databases, state.dbName],
  )

  const { handleSelect: handlePaletteSelect } = usePaletteActions({
    state,
    dispatch,
    renderer,
    setPaletteMode,
  })

  const handlePaletteClose = useCallback(() => {
    setPaletteMode("commands")
    dispatch({ type: "CLOSE_COMMAND_PALETTE" })
  }, [])

  // Palette visible for in-app Ctrl+P commands only (startup flow uses WelcomeScreen)
  const paletteVisible =
    state.commandPaletteVisible || paletteMode === "databases" || paletteMode === "collections"

  const effectivePaletteMode: PaletteMode = paletteMode

  const effectiveCommands =
    effectivePaletteMode === "databases"
      ? databaseCommands
      : effectivePaletteMode === "collections"
        ? collectionCommands
        : mainCommands
  const effectivePlaceholder =
    effectivePaletteMode === "databases"
      ? "Switch database..."
      : effectivePaletteMode === "collections"
        ? state.collectionsLoading ? "Loading collections..." : "Open collection..."
        : "Search commands..."

  // Welcome screen: shown when db is loaded but no tab is open yet
  const showWelcome = !state.error && !state.collectionsLoading && !state.activeTabId

  // Determine welcome step
  const welcomeStep: 1 | 2 = !state.dbName ? 1 : 2

  const handleSelectDatabase = useCallback(
    (name: string) => {
      dispatch({ type: "SELECT_DATABASE", dbName: name })
    },
    [],
  )

  const handleSelectCollection = useCallback(
    (name: string) => {
      dispatch({ type: "OPEN_TAB", collectionName: name })
    },
    [],
  )

  const handleWelcomeBack = useCallback(() => {
    // Return to step 1: clear dbName but keep databases list in state
    dispatch({ type: "RESET_DATABASE" })
  }, [])

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
  const selectedDoc = state.documents[state.selectedIndex] ?? null

  return (
    <Shell>
      <Header
        dbName={state.dbName}
        host={state.host}
        collectionName={state.tabs.length === 1 ? activeTab?.collectionName : undefined}
        loading={state.collectionsLoading || state.documentsLoading}
        right={
          activeTab
            ? formatDocumentCount(
                state.loadedCount,
                state.documentCount,
                state.totalDocumentCount,
                !!(state.queryInput || state.pipelineMode),
              )
            : ""
        }
        selectionMode={state.selectionMode}
        selectionCount={state.selectedIds.size}
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
        ) : showWelcome ? (
          <WelcomeScreen
            step={welcomeStep}
            databases={state.databases}
            collections={state.collections.map((c) => c.name)}
            dbName={state.dbName}
            host={state.host}
            onSelectDatabase={handleSelectDatabase}
            onSelectCollection={handleSelectCollection}
            onBack={handleWelcomeBack}
            onBackToUri={onBackToUri}
          />
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
              sortField={resolveSortField(state.pipelineMode, state.pipeline, state.sortField)}
              sortDirection={resolveSortDirection(
                state.pipelineMode,
                state.pipeline,
                state.sortDirection,
              )}
              selectionMode={state.selectionMode}
              selectedRows={state.selectedRows}
              loading={state.documentsLoading}
              scrollRef={docListScrollRef}
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

      {/* History picker — Ctrl-Y while simple bar is open */}
      {state.historyPickerOpen && state.queryVisible && (
        <HistoryPicker
          entries={state.historyEntries}
          onPick={(entry) => {
            dispatch({ type: "SET_QUERY_INPUT", input: entry })
            dispatch({ type: "CLOSE_HISTORY_PICKER" })
            dispatch({ type: "SUBMIT_QUERY" })
          }}
          onClose={() => dispatch({ type: "CLOSE_HISTORY_PICKER" })}
        />
      )}

      {/* Suggestions only in simple mode, hidden when history picker is open */}
      <FilterSuggestions
        visible={state.queryVisible && !state.pipelineMode && state.queryMode === "simple" && !state.historyPickerOpen}
        query={state.queryInput}
        queryMode={state.queryMode}
        columns={state.columns}
        schemaMap={state.schemaMap}
        onChange={(q) => dispatch({ type: "SET_QUERY_INPUT", input: q })}
      />

      {/* Pipeline bar — shown in pipeline mode */}
      {state.pipelineMode && state.filterBarVisible && (
        <PipelineBar
          pipeline={state.pipeline}
          isAggregate={state.pipelineIsAggregate}
          watching={state.pipelineWatching}
        />
      )}

      {/* Filter bar — shown in simple mode */}
      {!state.pipelineMode && state.filterBarVisible && (
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
          onQueryChange={(q) => dispatch({ type: "SET_QUERY_INPUT", input: q })}
          onBsonSortChange={(v) => dispatch({ type: "SET_BSON_SORT", input: v })}
          onBsonProjectionChange={(v) => dispatch({ type: "SET_BSON_PROJECTION", input: v })}
          onSubmit={() => dispatch({ type: "SUBMIT_QUERY" })}
        />
      )}

      <CommandPalette
        key={effectivePaletteMode}
        visible={paletteVisible}
        commands={effectiveCommands}
        onSelect={handlePaletteSelect}
        onClose={handlePaletteClose}
        placeholder={effectivePlaceholder}
      />

      {state.pipelineConfirm && (
        <PipelineConfirmDialog
          pipeline={state.pipeline}
          simpleQuery={state.pipelineConfirm.simpleQuery}
          focusedIndex={pipelineFocusedIndex}
        />
      )}

      <Toast message={state.message} onDismiss={() => dispatch({ type: "CLEAR_MESSAGE" })} />

      {state.bulkEditConfirmation && (
        <BulkEditConfirmDialog
          confirmation={state.bulkEditConfirmation}
          focusedIndex={bulkEditFocusedIndex}
        />
      )}

      {state.deleteConfirmation && (
        <DeleteConfirmDialog
          confirmation={state.deleteConfirmation}
          focusedIndex={deleteFocusedIndex}
        />
      )}
    </Shell>
  )
}
