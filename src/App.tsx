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
import { ConfirmDialog } from "./components/ConfirmDialog"
import type { ConfirmLine, ConfirmOption } from "./components/ConfirmDialog"
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
import { parseSimpleQueryFull, projectionToSimple } from "./query/parser"
import { getNestedValue } from "./utils/format"
import { editDocument } from "./actions/edit"
import { openPipelineEditor, writePipelineFile, pipelineFilePaths } from "./actions/pipeline"
import { startWatching, stopWatching, reloadFromFile, openTmuxSplit } from "./actions/pipelineWatch"
import { openEditorForMany, openEditorForInsert, applyConfirmActions } from "./actions/editMany"
import { disconnect, listDatabases, switchDatabase, deleteDocument } from "./providers/mongodb"
import { serializeDocument } from "./utils/document"
import { theme } from "./theme"
import type { Command } from "./commands/types"
import type { Document } from "mongodb"

function docSummary(doc: Document): string {
  const LABEL_FIELDS = ["name", "title", "label", "email", "username", "slug", "key"]
  for (const field of LABEL_FIELDS) {
    const val = doc[field]
    if (val !== undefined && val !== null && typeof val !== "object")
      return `${field}: ${String(val)}`
  }
  for (const [key, val] of Object.entries(doc)) {
    if (key === "_id") continue
    if (val !== undefined && val !== null && typeof val !== "object")
      return `${key}: ${String(val)}`
  }
  return `_id: ${String(doc._id)}`
}

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
  useKeyboardNav({ state, dispatch, docListScrollRef })
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

  const handlePaletteSelect = useCallback(
    (cmd: Command) => {
      // Database selection
      if (cmd.id.startsWith("db:")) {
        const selectedDb = cmd.id.slice(3)
        switchDatabase(selectedDb)
        dispatch({ type: "SELECT_DATABASE", dbName: selectedDb })
        setPaletteMode("commands")
        return
      }

      // Collection selection
      if (cmd.id.startsWith("open:")) {
        dispatch({ type: "CLOSE_COMMAND_PALETTE" })
        setPaletteMode("commands")
        dispatch({ type: "OPEN_TAB", collectionName: cmd.id.slice(5) })
        return
      }

      switch (cmd.id) {
        case "nav:switch-database": {
          // Fetch fresh database list then switch palette to databases mode
          listDatabases()
            .then((databases) => {
              dispatch({ type: "SET_DATABASES", databases })
              setPaletteMode("databases")
            })
            .catch((err: Error) => {
              dispatch({ type: "CLOSE_COMMAND_PALETTE" })
              dispatch({ type: "SET_ERROR", error: `Failed to list databases: ${err.message}` })
            })
          break
        }
        case "nav:switch-collection":
          setPaletteMode("collections")
          break
        case "doc:edit": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const doc = state.documents[state.selectedIndex]
          const tab = state.tabs.find((t) => t.id === state.activeTabId)
          if (doc && tab) {
            renderer.suspend()
            editDocument(tab.collectionName, state.dbName, doc, state.schemaMap).finally(() => {
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
            dispatch({ type: "SHOW_MESSAGE", message: "Copied to clipboard", kind: "info" })
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
            dispatch({ type: "SHOW_MESSAGE", message: "Copied _id", kind: "info" })
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
        case "view:toggle-filter-bar":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "TOGGLE_FILTER_BAR" })
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
        case "query:open-pipeline": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
          if (!activeTab) break
          renderer.suspend()
          openPipelineEditor({
            collectionName: activeTab.collectionName,
            dbName: state.dbName,
            tabId: activeTab.id,
            pipelineSource: state.pipelineSource,
            currentPipeline: state.pipeline,
            simpleQuery: state.queryInput,
            schemaMap: state.schemaMap,
            sortField: state.sortField,
            sortDirection: state.sortDirection,
          })
            .then((result) => {
              if (!result) return
              dispatch({
                type: "SET_PIPELINE",
                pipeline: result.pipeline,
                source: result.source,
                isAggregate: result.isAggregate,
              })
              const { queryFile } = pipelineFilePaths(
                state.dbName,
                activeTab.collectionName,
                activeTab.id,
              )
              startWatching(queryFile, () => reloadFromFile(queryFile, dispatch))
              dispatch({ type: "START_PIPELINE_WATCH" })
            })
            .catch((err: Error) => {
              dispatch({ type: "SET_ERROR", error: `Pipeline error: ${err.message}` })
            })
            .finally(() => {
              renderer.resume()
            })
          break
        }
        case "query:clear-pipeline":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "CLEAR_PIPELINE" })
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
        case "query:open-pipeline-tmux": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
          if (!activeTab) break
          writePipelineFile({
            collectionName: activeTab.collectionName,
            dbName: state.dbName,
            tabId: activeTab.id,
            pipelineSource: state.pipelineSource,
            currentPipeline: state.pipeline,
            simpleQuery: state.queryInput,
            schemaMap: state.schemaMap,
            sortField: state.pipeline.length > 0 ? null : state.sortField,
            sortDirection: state.sortDirection,
          })
            .then((queryFile) => {
              const result = openTmuxSplit(queryFile)
              if (result === "tmux") {
                startWatching(queryFile, () => reloadFromFile(queryFile, dispatch))
                dispatch({ type: "START_PIPELINE_WATCH" })
                dispatch({
                  type: "SHOW_MESSAGE",
                  message: "Opened in tmux split — watching for saves",
                  kind: "info",
                })
              } else if (result === "clipboard") {
                dispatch({
                  type: "SHOW_MESSAGE",
                  message: `Path copied to clipboard: ${queryFile}`,
                  kind: "info",
                })
              } else {
                dispatch({
                  type: "SHOW_MESSAGE",
                  message: `Pipeline file: ${queryFile}`,
                  kind: "info",
                })
              }
            })
            .catch(() => {})
          break
        }
        case "doc:insert": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
          if (!activeTab) break
          const templateDoc = state.documents[state.selectedIndex]
          renderer.suspend()
          openEditorForInsert(activeTab.collectionName, state.dbName, templateDoc, state.schemaMap)
            .then((outcome) => {
              renderer.resume()
              if (outcome.cancelled) return
              if (outcome.errors.length > 0) {
                dispatch({ type: "SHOW_MESSAGE", message: outcome.errors[0], kind: "error" })
              } else if (outcome.inserted > 0) {
                dispatch({
                  type: "SHOW_MESSAGE",
                  message: `Inserted ${outcome.inserted} document${outcome.inserted === 1 ? "" : "s"}`,
                  kind: "success",
                })
                dispatch({ type: "RELOAD_DOCUMENTS" })
              } else {
                dispatch({ type: "SHOW_MESSAGE", message: "No documents inserted", kind: "info" })
              }
            })
            .catch((err: Error) => {
              renderer.resume()
              dispatch({
                type: "SHOW_MESSAGE",
                message: `Insert failed: ${err.message}`,
                kind: "error",
              })
            })
          break
        }
        case "doc:delete": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
          if (!activeTab) break
          const docsToDelete =
            state.selectedRows.size > 0
              ? state.documents.filter((_, i) => state.selectedRows.has(i))
              : [state.documents[state.selectedIndex]].filter(Boolean)
          if (docsToDelete.length === 0) break
          dispatch({
            type: "SHOW_DELETE_CONFIRM",
            confirmation: {
              docs: docsToDelete,
              focusedIndex: -1,
              resolve: async (confirmed) => {
                if (!confirmed) return
                const errors: string[] = []
                for (const doc of docsToDelete) {
                  try {
                    await deleteDocument(activeTab.collectionName, doc._id)
                  } catch (err) {
                    errors.push(`Delete failed: ${(err as Error).message}`)
                  }
                }
                if (errors.length > 0) {
                  dispatch({ type: "SHOW_MESSAGE", message: errors[0], kind: "error" })
                } else {
                  const n = docsToDelete.length
                  dispatch({
                    type: "SHOW_MESSAGE",
                    message: `Deleted ${n} document${n === 1 ? "" : "s"}`,
                    kind: "success",
                  })
                  dispatch({ type: "EXIT_SELECTION_MODE" })
                }
                dispatch({ type: "RELOAD_DOCUMENTS" })
              },
            },
          })
          break
        }
        case "doc:copy-cell": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const doc = state.documents[state.selectedIndex]
          if (!doc) break
          const visCols2 = state.columns.filter((c) => c.visible)
          const col = visCols2[state.selectedColumnIndex]
          if (!col) break
          const val = getNestedValue(doc as Record<string, unknown>, col.field)
          const text =
            val === undefined
              ? ""
              : typeof val === "object" && val !== null
                ? JSON.stringify(val, null, 2)
                : String(val)
          process.stdout.write(`\x1b]52;c;${btoa(text)}\x07`)
          dispatch({
            type: "SHOW_MESSAGE",
            message: `Copied ${col.field} to clipboard`,
            kind: "info",
          })
          break
        }
        case "view:cycle-column-mode":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "CYCLE_COLUMN_MODE" })
          break
        case "view:toggle-column-exclude": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const visCols = state.columns.filter((c) => c.visible)
          const col = visCols[state.selectedColumnIndex]
          if (!col) break
          const { projection: projObj3 } = parseSimpleQueryFull(state.queryInput)
          const proj3: Record<string, 0 | 1> = { ...(projObj3 ?? {}) }
          if (proj3[col.field] === 0) {
            delete proj3[col.field]
          } else {
            delete proj3[col.field]
            proj3[col.field] = 0
          }
          const nonProjTokens3 = state.queryInput
            .trim()
            .split(/\s+/)
            .filter((t: string) => {
              if (!t) return false
              if (t.startsWith("+")) return false
              if (t.startsWith("-") && !/[><!:]/.test(t.slice(1))) return false
              return true
            })
          const projStr3 = Object.keys(proj3).length > 0 ? " " + projectionToSimple(proj3) : ""
          dispatch({ type: "SET_QUERY_INPUT", input: (nonProjTokens3.join(" ") + projStr3).trim() })
          dispatch({ type: "SUBMIT_QUERY" })
          break
        }
        case "tabs:clone":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "CLONE_TAB" })
          break
        case "tabs:close":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          if (state.activeTabId) dispatch({ type: "CLOSE_TAB", tabId: state.activeTabId })
          break
        case "tabs:undo-close":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "UNDO_CLOSE_TAB" })
          break
        case "tabs:prev": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const currentIndex = state.tabs.findIndex((t) => t.id === state.activeTabId)
          if (currentIndex > 0) {
            stopWatching()
            dispatch({ type: "STOP_PIPELINE_WATCH" })
            dispatch({ type: "SWITCH_TAB", tabId: state.tabs[currentIndex - 1].id })
          }
          break
        }
        case "tabs:next": {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          const currentIndex = state.tabs.findIndex((t) => t.id === state.activeTabId)
          if (currentIndex < state.tabs.length - 1) {
            stopWatching()
            dispatch({ type: "STOP_PIPELINE_WATCH" })
            dispatch({ type: "SWITCH_TAB", tabId: state.tabs[currentIndex + 1].id })
          }
          break
        }
        case "selection:enter":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "ENTER_SELECTION_MODE" })
          break
        case "selection:freeze":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "FREEZE_SELECTION" })
          break
        case "selection:exit":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "EXIT_SELECTION_MODE" })
          break
        case "selection:select-all":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "SELECT_ALL" })
          break
        case "app:quit":
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          stopWatching()
          disconnect().catch(() => {})
          renderer.destroy()
          process.exit(0)
          break
        default:
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      }
    },
    [state, renderer],
  )

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
            ? (() => {
                const loaded = state.loadedCount
                const filtered = state.documentCount
                const total = state.totalDocumentCount
                const hasFilter = !!(state.queryInput || state.pipelineMode)
                // "340 of 2,034 | Total: 2,100" or "340 of 2,034" or "2,034 docs"
                if (loaded < filtered) {
                  const range = `${loaded.toLocaleString()} of ${filtered.toLocaleString()}`
                  return hasFilter ? `${range} | Total: ${total.toLocaleString()}` : range
                }
                return hasFilter
                  ? `${filtered.toLocaleString()} of ${total.toLocaleString()}`
                  : `${filtered.toLocaleString()} docs`
              })()
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
              sortField={state.sortField}
              sortDirection={state.sortDirection}
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
          columns={state.columns}
          schemaMap={state.schemaMap}
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

      {state.pipelineConfirm &&
        (() => {
          const hasComplex = state.pipeline.some(
            (s) => !["$match", "$sort", "$project"].includes(Object.keys(s)[0]),
          )
          const lines: import("./components/ConfirmDialog").ConfirmLine[] = [
            {
              text: hasComplex
                ? "Pipeline has complex stages that cannot be expressed in simple mode."
                : "Some filter conditions cannot be fully translated to simple mode.",
              dim: true,
            },
            { text: "" },
            {
              text: state.pipelineConfirm.simpleQuery
                ? `Translated: ${state.pipelineConfirm.simpleQuery}`
                : "(no translatable conditions)",
              dim: true,
            },
          ]
          const options: import("./components/ConfirmDialog").ConfirmOption[] = [
            { key: "n", label: "New tab (clean filter)", color: theme.primary },
            { key: "o", label: "Overwrite (use translated portion)", color: theme.warning },
            { key: "Esc", label: "Cancel", color: theme.textMuted },
          ]
          return (
            <ConfirmDialog
              title="Switch to simple filter?"
              lines={lines}
              options={options}
              focusedIndex={state.pipelineConfirm.focusedIndex}
            />
          )
        })()}

      <Toast message={state.message} onDismiss={() => dispatch({ type: "CLEAR_MESSAGE" })} />

      {state.bulkEditConfirmation &&
        (() => {
          const { missing, added, focusedIndex } = state.bulkEditConfirmation
          const missingCount = missing.length
          const addedCount = added.length
          const lines: ConfirmLine[] = []
          if (missingCount > 0) {
            lines.push({
              text: `${missingCount} doc${missingCount === 1 ? "" : "s"} removed from array:`,
              dim: true,
            })
            for (const doc of missing) lines.push({ text: `  ${docSummary(doc)}`, danger: true })
          }
          if (addedCount > 0) {
            if (missingCount > 0) lines.push({ text: "" })
            lines.push({
              text: `${addedCount} new doc${addedCount === 1 ? "" : "s"} added to array:`,
              dim: true,
            })
            for (const doc of added) lines.push({ text: `  ${docSummary(doc)}` })
          }
          const options: ConfirmOption[] = [
            { key: "b", label: "back to editor", color: theme.primary },
            { key: "i", label: "skip side effects", color: theme.secondary },
          ]
          if (missingCount > 0)
            options.push({ key: "d", label: `delete ${missingCount}`, color: theme.error })
          if (addedCount > 0)
            options.push({ key: "a", label: `insert ${addedCount}`, color: theme.success })
          if (missingCount > 0 && addedCount > 0)
            options.push({ key: "x", label: "both", color: theme.error })
          options.push({ key: "c", label: "cancel", color: theme.textMuted })
          return (
            <ConfirmDialog
              title="Bulk Edit — Side Effects"
              lines={lines}
              options={options}
              focusedIndex={focusedIndex}
            />
          )
        })()}

      {state.deleteConfirmation &&
        (() => {
          const { docs, focusedIndex } = state.deleteConfirmation
          const lines: ConfirmLine[] = [
            { text: `Delete ${docs.length} document${docs.length === 1 ? "" : "s"}?` },
            { text: "" },
            ...docs.map((doc) => ({ text: `  ${docSummary(doc)}`, danger: true })),
          ]
          const options: ConfirmOption[] = [
            { key: "c", label: "cancel", color: theme.textMuted },
            { key: "d", label: `delete ${docs.length}`, color: theme.error },
          ]
          return (
            <ConfirmDialog
              title="Delete Documents"
              lines={lines}
              options={options}
              focusedIndex={focusedIndex}
            />
          )
        })()}
    </Shell>
  )
}
