/**
 * Main application component.
 * Thin composition — logic in hooks, display in components.
 */

import { useReducer, useMemo, useCallback, useState } from "react"
import { useRenderer } from "@opentui/react"
import { Shell } from "./components/Shell"
import { Header } from "./components/Header"
import { FilterBar } from "./components/FilterBar"
import { PipelineBar } from "./components/PipelineBar"
import { ConfirmDialog, ConfirmChoiceDialog } from "./components/ConfirmDialog"
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
import { editDocument } from "./actions/edit"
import { openPipelineEditor } from "./actions/pipeline"
import { disconnect, serializeDocument } from "./providers/mongodb"
import { theme } from "./theme"
import type { Command } from "./commands/types"
import type { Document } from "mongodb"

function docSummary(doc: Document): string {
  const LABEL_FIELDS = ["name", "title", "label", "email", "username", "slug", "key"]
  for (const field of LABEL_FIELDS) {
    const val = doc[field]
    if (val !== undefined && val !== null && typeof val !== "object") return `${field}: ${String(val)}`
  }
  for (const [key, val] of Object.entries(doc)) {
    if (key === "_id") continue
    if (val !== undefined && val !== null && typeof val !== "object") return `${key}: ${String(val)}`
  }
  return `_id: ${String(doc._id)}`
}

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
      case "query:open-pipeline": {
        dispatch({ type: "CLOSE_COMMAND_PALETTE" })
        const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
        if (!activeTab) break
        renderer.suspend()
        openPipelineEditor({
          collectionName: activeTab.collectionName,
          dbName: state.dbName,
          pipelineSource: state.pipelineSource,
          simpleQuery: state.queryInput,
          schemaMap: state.schemaMap,
          sortField: state.sortField,
          sortDirection: state.sortDirection,
        })
          .then((result) => {
            if (!result) return
            dispatch({ type: "SET_PIPELINE", pipeline: result.pipeline, source: result.source, isAggregate: result.isAggregate })
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
      {state.pipelineMode && (
        <PipelineBar
          pipeline={state.pipeline}
          isAggregate={state.pipelineIsAggregate}
        />
      )}

      {/* Filter bar — shown in simple mode */}
      {!state.pipelineMode && (
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

      {state.pipelineConfirm && (() => {
        const hasComplex = state.pipeline.some(
          (s) => !["$match","$sort","$project"].includes(Object.keys(s)[0])
        )
        const lines: import("./components/ConfirmDialog").ConfirmLine[] = [
          { text: hasComplex
            ? "Pipeline has complex stages that cannot be expressed in simple mode."
            : "Some filter conditions cannot be fully translated to simple mode.",
            dim: true
          },
          { text: "" },
          { text: state.pipelineConfirm.simpleQuery
              ? `Translated: ${state.pipelineConfirm.simpleQuery}`
              : "(no translatable conditions)",
            dim: true
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

      <Toast
        message={state.message}
        onDismiss={() => dispatch({ type: "CLEAR_MESSAGE" })}
      />

      {state.bulkEditConfirmation && (() => {
        const { missing, added, focusedIndex } = state.bulkEditConfirmation
        const missingCount = missing.length
        const addedCount = added.length
        const lines: ConfirmLine[] = []
        if (missingCount > 0) {
          lines.push({ text: `${missingCount} doc${missingCount === 1 ? "" : "s"} removed from array:`, dim: true })
          for (const doc of missing) lines.push({ text: `  ${docSummary(doc)}`, danger: true })
        }
        if (addedCount > 0) {
          if (missingCount > 0) lines.push({ text: "" })
          lines.push({ text: `${addedCount} new doc${addedCount === 1 ? "" : "s"} added to array:`, dim: true })
          for (const doc of added) lines.push({ text: `  ${docSummary(doc)}` })
        }
        const options: ConfirmOption[] = [
          { key: "b", label: "back to editor", color: theme.primary },
          { key: "i", label: "skip side effects", color: theme.secondary },
        ]
        if (missingCount > 0) options.push({ key: "d", label: `delete ${missingCount}`, color: theme.error })
        if (addedCount > 0) options.push({ key: "a", label: `insert ${addedCount}`, color: theme.success })
        if (missingCount > 0 && addedCount > 0) options.push({ key: "x", label: "both", color: theme.error })
        options.push({ key: "c", label: "cancel", color: theme.textMuted })
        return <ConfirmDialog title="Bulk Edit — Side Effects" lines={lines} options={options} focusedIndex={focusedIndex} />
      })()}

      {state.deleteConfirmation && (() => {
        const { docs, focusedIndex } = state.deleteConfirmation
        const lines: ConfirmLine[] = [
          { text: `Delete ${docs.length} document${docs.length === 1 ? "" : "s"}?` },
          { text: "" },
          ...docs.map((doc) => ({ text: `  ${docSummary(doc)}`, danger: true })),
        ]
        const options: ConfirmOption[] = [
          { key: "d", label: `delete ${docs.length}`, color: theme.error },
          { key: "c", label: "cancel", color: theme.textMuted },
        ]
        return <ConfirmDialog title="Delete Documents" lines={lines} options={options} focusedIndex={focusedIndex} />
      })()}
    </Shell>
  )
}
