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
import { CommandPalette } from "./components/CommandPalette"
import { TabBar } from "./components/TabBar"
import { appReducer, createInitialState } from "./state"
import { useMongoConnection } from "./hooks/useMongoConnection"
import { useKeyboardNav } from "./hooks/useKeyboardNav"
import { useDocumentLoader } from "./hooks/useDocumentLoader"
import { buildCommands } from "./commands/builder"
import { buildCollectionCommands } from "./commands/collections"
import { buildDatabaseCommands } from "./commands/databases"
import { usePaletteActions } from "./hooks/usePaletteActions"
import { formatDocumentCount, resolveSortField, resolveSortDirection } from "./utils/format"

interface AppProps {
  uri: string
}

type PaletteMode = "commands" | "collections" | "databases"

export function App({ uri }: AppProps) {
  const [state, dispatch] = useReducer(appReducer, null, createInitialState)
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("commands")
  const renderer = useRenderer()
  const { height: terminalHeight } = useTerminalDimensions()
  const docListScrollRef = useRef<ScrollBoxRenderable>(null)

  const pageSize = terminalHeight + 10

  useMongoConnection({ uri, dispatch, dbName: state.dbName })
  const { pipelineFocusedIndex, bulkEditFocusedIndex, deleteFocusedIndex } = useKeyboardNav({
    state,
    dispatch,
    docListScrollRef,
  })
  useDocumentLoader({ state, dispatch, pageSize })

  // Build palette commands based on mode
  const mainCommands = useMemo(() => buildCommands(state), [state])
  const collectionCommands = useMemo(
    () => buildCollectionCommands(state.collections),
    [state.collections],
  )
  const databaseCommands = useMemo(
    () => buildDatabaseCommands(state.databases, state.dbName || undefined),
    [state.databases, state.dbName],
  )

  // Open the db picker palette when state requests it
  useEffect(() => {
    if (state.dbPickerOpen) {
      setPaletteMode("databases")
      dispatch({ type: "CLOSE_DB_PICKER" }) // consumed — palette visibility is controlled separately
    }
  }, [state.dbPickerOpen])

  const { handleSelect: handlePaletteSelect } = usePaletteActions({
    state,
    dispatch,
    renderer,
    setPaletteMode,
  })

  const handlePaletteClose = useCallback(() => {
    // Can't escape the db picker if no db has been selected yet
    if (paletteMode === "databases" && !state.dbName) {
      return
    }
    if (paletteMode === "collections" || paletteMode === "databases") {
      // Go back to main commands (or close palette if triggered explicitly)
      setPaletteMode("commands")
      if (paletteMode === "databases") {
        dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      }
    } else {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      setPaletteMode("commands")
    }
  }, [paletteMode, state.dbName])

  // Show palette automatically when no db is selected, or when no tab is open, or explicitly opened
  const paletteVisible =
    state.commandPaletteVisible ||
    paletteMode === "databases" ||
    (state.view === "collections" && !state.collectionsLoading && !state.error && !!state.dbName)

  // Determine the effective palette mode
  const effectivePaletteMode: PaletteMode =
    paletteMode === "databases"
      ? "databases"
      : !state.activeTabId && paletteVisible
        ? "collections"
        : paletteMode

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
        ? "Open collection..."
        : "Search commands..."

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

      {/* Suggestions only in simple mode */}
      <FilterSuggestions
        visible={state.queryVisible && !state.pipelineMode && state.queryMode === "simple"}
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
