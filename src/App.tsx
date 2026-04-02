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
import { BulkQueryUpdateConfirmDialog } from "./components/BulkQueryUpdateConfirmDialog"
import { BulkQueryDeleteConfirmDialog } from "./components/BulkQueryDeleteConfirmDialog"
import { DeleteConfirmDialog } from "./components/DeleteConfirmDialog"
import { DropConfirmDialog } from "./components/DropConfirmDialog"
import { CreateInputDialog } from "./components/CreateInputDialog"
import { RenameInputDialog } from "./components/RenameInputDialog"
import { Toast } from "./components/Toast"
import { Loading } from "./components/Loading"
import { ErrorView } from "./components/ErrorView"
import { DocumentList } from "./components/DocumentList"
import { DocumentPreview } from "./components/DocumentPreview"
import { FilterSuggestions } from "./components/FilterSuggestions"
import { HistoryPicker } from "./components/HistoryPicker"
import { CommandPalette } from "./components/CommandPalette"
import { IndexCreateConfirmDialog } from "./components/IndexCreateConfirmDialog"
import { ExplainPreview } from "./components/ExplainPreview"
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
import { buildThemeCommands } from "./commands/themes"
import type { Command } from "./commands/types"
import { findPreset } from "./themes/index"
import { buildTheme } from "./theme"
import { useApplyTheme } from "./hooks/useApplyTheme"
import { usePaletteActions } from "./hooks/usePaletteActions"
import { formatDocumentCount, resolveSortField, resolveSortDirection } from "./utils/format"
import { randomConnectionMessage } from "./utils/loadingMessages"
import { usePipelineWatcher } from "./hooks/usePipelineWatcher"
import type { Keymap, ThemeConfig } from "./config/types"

type PaletteMode = "commands" | "collections" | "databases" | "themes"

interface AppProps {
  uri: string
  keymap: Keymap
  configWarnings?: string[]
  /** Theme preset ID active at startup (state file > config > default). */
  initialThemeId?: string
  /** The preset ID from config.toml, if any — used as reset target. */
  configThemeId?: string | null
  /** The [theme] token overrides from config.toml — re-applied after any preset. */
  configThemeOverrides?: Partial<ThemeConfig>
  onBackToUri?: () => void
}

export function App({
  uri,
  keymap,
  configWarnings = [],
  initialThemeId = "tokyo-night",
  configThemeId = null,
  configThemeOverrides = {},
  onBackToUri,
}: AppProps) {
  const [state, dispatch] = useReducer(appReducer, null, createInitialState)
  usePipelineWatcher(state, dispatch)
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("commands")
  // Active theme preset ID — used to show a checkmark in the theme picker
  const [activeThemeId, setActiveThemeId] = useState(initialThemeId)
  // Unified theme application: updates the singleton + forces re-render
  const { applyTheme, themeVersion } = useApplyTheme()
  // The theme that was active when the theme picker was opened — used to revert on cancel
  const previewBaseThemeId = useRef("tokyo-night")

  // Capture base theme when the themes picker opens so escape can revert
  useEffect(() => {
    if (paletteMode === "themes") {
      previewBaseThemeId.current = activeThemeId
    }
  }, [paletteMode, activeThemeId])
  const [loadingMessage, setLoadingMessage] = useState(randomConnectionMessage)
  // Hold-off: don't show the loading screen until 500ms have passed.
  // Prevents a jarring flash when the connection is very fast.
  const [showLoader, setShowLoader] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setShowLoader(true), 500)
    return () => clearTimeout(t)
  }, [])
  const renderer = useRenderer()
  const { height: terminalHeight, width: terminalWidth } = useTerminalDimensions()
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
    if (prevReloadCounter.current === state.reloadCounter) {
      return
    }
    prevReloadCounter.current = state.reloadCounter
    if (state.queryMode === "simple" && state.queryInput.trim()) {
      const query = state.queryInput.trim()
      appendHistory(query)
      dispatch({ type: "APPEND_HISTORY_ENTRY", entry: query })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.reloadCounter])

  // Surface config warnings as toasts once on mount
  useEffect(() => {
    if (configWarnings.length === 0) {
      return
    }
    // Show warnings one at a time (first one immediately; subsequent ones via re-renders
    // would require a queue — for simplicity show only the first warning)
    dispatch({
      type: "SHOW_MESSAGE",
      message: configWarnings[0],
      kind: "warning",
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const {
    handleCreateCollection,
    handleCreateDatabase,
    handleDropCollection,
    handleDropDatabase,
    handleRenameCollection,
  } = useMongoConnection({ uri, dispatch, dbName: state.dbName, state })
  const {
    pipelineFocusedIndex,
    bulkEditFocusedIndex,
    deleteFocusedIndex,
    bulkQueryUpdateFocusedIndex,
    bulkQueryUpdateAwaitingFinal,
    bulkQueryDeleteFocusedIndex,
    bulkQueryDeleteAwaitingFinal,
    indexCreateFocusedIndex,
  } = useKeyboardNav({
    state,
    dispatch,
    docListScrollRef,
    keymap,
  })
  useDocumentLoader({ state, dispatch, pageSize })

  // Build palette commands based on mode (for in-app switching via Ctrl+P)
  const mainCommands = useMemo(() => buildCommands(state, keymap), [state, keymap])
  const collectionCommands = useMemo(
    () => buildCollectionCommands(state.collections),
    [state.collections],
  )
  const databaseCommands = useMemo(
    () => buildDatabaseCommands(state.databases, state.dbName || undefined),
    [state.databases, state.dbName],
  )

  const handleThemeChange = useCallback((presetId: string) => {
    previewBaseThemeId.current = presetId
    setActiveThemeId(presetId)
  }, [])

  // Live preview: apply theme as cursor moves over presets, revert on null (close/escape)
  const handleThemeHighlight = useCallback(
    (cmd: Command | null) => {
      // null = closed/escaped → revert to base
      // "reset" = hovering Reset entry → preview the config/default theme
      const presetId = cmd ? cmd.id.slice(6) : null
      const id =
        presetId === null
          ? previewBaseThemeId.current
          : presetId === "reset"
            ? (configThemeId ?? "tokyo-night")
            : presetId
      const preset = findPreset(id)
      if (preset) {
        applyTheme(buildTheme({ ...preset.theme, ...configThemeOverrides }))
      }
    },
    [configThemeId, configThemeOverrides, applyTheme],
  )

  const { handleSelect: handlePaletteSelect } = usePaletteActions({
    state,
    dispatch,
    renderer,
    setPaletteMode,
    onThemeChange: handleThemeChange,
    applyTheme,
    configThemeId,
    configThemeOverrides,
    onCreateCollection: handleCreateCollection,
    onRenameCollection: handleRenameCollection,
    onDropCollection: handleDropCollection,
    onDropDatabase: handleDropDatabase,
  })

  const handlePaletteClose = useCallback(() => {
    // Revert to the base theme if the picker was open (in case user pressed escape mid-preview)
    if (paletteMode === "themes") {
      const base = findPreset(previewBaseThemeId.current)
      if (base) {
        applyTheme(base.theme)
      }
    }
    setPaletteMode("commands")
    dispatch({ type: "CLOSE_COMMAND_PALETTE" })
  }, [paletteMode, applyTheme])

  // Build theme commands list (re-computed when active theme changes)
  const themeCommands = useMemo(() => buildThemeCommands(activeThemeId), [activeThemeId])

  // Palette visible for in-app Ctrl+P commands only (startup flow uses WelcomeScreen)
  const paletteVisible =
    state.commandPaletteVisible ||
    paletteMode === "databases" ||
    paletteMode === "collections" ||
    paletteMode === "themes"

  const effectivePaletteMode: PaletteMode = paletteMode

  const effectiveCommands =
    effectivePaletteMode === "databases"
      ? databaseCommands
      : effectivePaletteMode === "collections"
        ? collectionCommands
        : effectivePaletteMode === "themes"
          ? themeCommands
          : mainCommands
  const effectivePlaceholder =
    effectivePaletteMode === "databases"
      ? "Switch database..."
      : effectivePaletteMode === "collections"
        ? state.collectionsLoading
          ? "Loading collections..."
          : "Open collection..."
        : effectivePaletteMode === "themes"
          ? "Choose theme..."
          : "Search commands..."
  const effectiveTitle =
    effectivePaletteMode === "databases"
      ? "Databases"
      : effectivePaletteMode === "collections"
        ? "Collections"
        : effectivePaletteMode === "themes"
          ? "Themes"
          : "Commands"

  // Welcome screen: shown when db is loaded but no tab is open yet
  const showWelcome = !state.error && !state.collectionsLoading && !state.activeTabId

  // Determine welcome step
  const welcomeStep: 1 | 2 = !state.dbName ? 1 : 2

  const handleSelectDatabase = useCallback((name: string) => {
    dispatch({ type: "SELECT_DATABASE", dbName: name })
  }, [])

  const handleSelectCollection = useCallback((name: string) => {
    dispatch({ type: "OPEN_TAB", collectionName: name })
  }, [])

  const handleWelcomeBack = useCallback(() => {
    // Return to step 1: clear dbName but keep databases list in state
    dispatch({ type: "RESET_DATABASE" })
  }, [])

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
  const selectedDoc = state.documents[state.selectedIndex] ?? null

  // Show full-screen loading (no chrome) during initial connection — avoids
  // layout jump when transitioning from ConnectionScreen's Loading state.
  // Hold-off: only show after 500ms to avoid a flash on fast connections.
  const isInitialLoading = state.collectionsLoading && !state.activeTabId

  useEffect(() => {
    if (!isInitialLoading) {
      return
    }
    const timer = setInterval(() => setLoadingMessage(randomConnectionMessage()), 5000)
    return () => clearInterval(timer)
  }, [isInitialLoading])

  if (isInitialLoading && showLoader) {
    return (
      <Shell>
        <Loading message={loadingMessage} />
      </Shell>
    )
  }

  // Still loading but within hold-off window — render nothing yet
  if (isInitialLoading) {
    return null
  }

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
        ) : showWelcome ? (
          <WelcomeScreen
            step={welcomeStep}
            databases={state.databases}
            collections={state.collections.map((c) => c.name)}
            dbName={state.dbName}
            host={state.host}
            databasesLoading={state.databasesLoading}
            collectionsLoading={state.collectionsLoading}
            onSelectDatabase={handleSelectDatabase}
            onSelectCollection={handleSelectCollection}
            onBack={handleWelcomeBack}
            onBackToUri={onBackToUri}
            onCreateDatabase={handleCreateDatabase}
            onCreateCollection={handleCreateCollection}
            onDropCollection={handleDropCollection}
            onDropDatabase={handleDropDatabase}
            onRenameCollection={handleRenameCollection}
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
              themeVersion={themeVersion}
              viewportWidth={
                state.previewPosition === "right" ? Math.floor(terminalWidth / 2) : terminalWidth
              }
            />
          </box>
        ) : null}

        {activeTab && state.previewMode === "explain" && (
          <ExplainPreview
            result={state.explainResult}
            loading={state.explainLoading}
            limited={state.explainLimited}
            position={state.previewPosition}
            scrollOffset={state.previewScrollOffset}
            collectionName={activeTab.collectionName}
          />
        )}

        {activeTab && state.previewMode === "document" && (
          <DocumentPreview
            document={selectedDoc}
            position={state.previewPosition}
            scrollOffset={state.previewScrollOffset}
          />
        )}
      </box>

      {/* History picker — Ctrl-R while simple bar is open */}
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
        visible={
          state.queryVisible &&
          !state.pipelineMode &&
          state.queryMode === "simple" &&
          !state.historyPickerOpen
        }
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
        onHighlight={paletteMode === "themes" ? handleThemeHighlight : undefined}
        placeholder={effectivePlaceholder}
        title={effectiveTitle}
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

      {state.bulkQueryUpdateConfirmation && (
        <BulkQueryUpdateConfirmDialog
          confirmation={state.bulkQueryUpdateConfirmation}
          focusedIndex={bulkQueryUpdateFocusedIndex}
          awaitingFinalConfirm={bulkQueryUpdateAwaitingFinal}
        />
      )}

      {state.bulkQueryDeleteConfirmation && (
        <BulkQueryDeleteConfirmDialog
          confirmation={state.bulkQueryDeleteConfirmation}
          focusedIndex={bulkQueryDeleteFocusedIndex}
          awaitingFinalConfirm={bulkQueryDeleteAwaitingFinal}
        />
      )}

      {state.dropConfirmation && (
        <DropConfirmDialog
          type={state.dropConfirmation.type}
          name={state.dropConfirmation.name}
          onConfirm={() => {
            state.dropConfirmation?.resolve(true)
            dispatch({ type: "CLEAR_DROP_CONFIRM" })
          }}
          onCancel={() => {
            state.dropConfirmation?.resolve(false)
            dispatch({ type: "CLEAR_DROP_CONFIRM" })
          }}
        />
      )}

      {state.renameInput && (
        <RenameInputDialog
          type={state.renameInput.type}
          oldName={state.renameInput.oldName}
          onConfirm={(newName) => {
            state.renameInput?.resolve(newName)
            dispatch({ type: "CLEAR_RENAME_INPUT" })
          }}
          onCancel={() => {
            state.renameInput?.resolve(null)
            dispatch({ type: "CLEAR_RENAME_INPUT" })
          }}
        />
      )}

      {state.createInput && (
        <CreateInputDialog
          onConfirm={(name) => {
            state.createInput?.resolve(name)
            dispatch({ type: "CLEAR_CREATE_INPUT" })
          }}
          onCancel={() => {
            state.createInput?.resolve(null)
            dispatch({ type: "CLEAR_CREATE_INPUT" })
          }}
        />
      )}

      {state.indexCreateConfirmation && (
        <IndexCreateConfirmDialog
          confirmation={state.indexCreateConfirmation}
          focusedIndex={indexCreateFocusedIndex}
        />
      )}
    </Shell>
  )
}
