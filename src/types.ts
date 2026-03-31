/**
 * Type definitions for Monq
 */

import type { Document } from "mongodb"
import type { SchemaMap } from "./query/schema"

// ============================================================================
// Selection
// ============================================================================

/** Row selection mode */
export type SelectionMode = "none" | "selecting" | "selected"

/** Pending bulk edit confirmation for missing/added docs */
export interface BulkEditConfirmation {
  missing: import("mongodb").Document[]
  added: import("mongodb").Document[]
  resolve: (missingAction: "ignore" | "delete", addedAction: "ignore" | "insert") => void
  goBack: () => void
}

/** Pending delete confirmation */
export interface DeleteConfirmation {
  docs: import("mongodb").Document[]
  resolve: (confirmed: boolean) => void
}

/** Pending bulk query update confirmation */
export interface BulkQueryUpdateConfirmation {
  collectionName: string
  filter: import("mongodb").Document
  update: import("mongodb").Document
  upsert: boolean
  matchedCount: number
  emptyFilter: boolean
  resolve: (confirmed: boolean) => void
}

/** Pending bulk query delete confirmation */
export interface BulkQueryDeleteConfirmation {
  collectionName: string
  filter: import("mongodb").Document
  matchedCount: number
  emptyFilter: boolean
  resolve: (confirmed: boolean) => void
}

// ============================================================================
// Views
// ============================================================================

/** Top-level views */
export type View = "collections" | "documents"

/** Preview panel position */
export type PreviewPosition = "right" | "bottom" | null

/** Query mode */
export type QueryMode = "simple" | "bson"

/** Which section is focused in the BSON editor */
export type BsonSection = "filter" | "sort" | "projection"

// ============================================================================
// Collection Types
// ============================================================================

/** Collection info from listCollections */
export interface CollectionInfo {
  name: string
  type: "collection" | "view" | "timeseries"
}

// ============================================================================
// Tab Types
// ============================================================================

export interface Tab {
  id: string
  collectionName: string
  /** Current query string */
  query: string
  queryMode: QueryMode
  /** BSON sort expression (only used in bson mode) */
  bsonSort: string
  /** BSON projection expression (only used in bson mode) */
  bsonProjection: string
  selectedIndex: number
  selectedColumnIndex: number
  scrollOffset: number
  /** Sort state */
  sortField: string | null
  sortDirection: 1 | -1
  /** Column display modes */
  columns: DetectedColumn[]
  /** Preview state */
  previewPosition: PreviewPosition
  previewScrollOffset: number
  /** Cached documents */
  documents: Document[]
  documentCount: number
  totalDocumentCount: number
  selectionMode: SelectionMode
  selectedIds: Set<string>
}

// ============================================================================
// Document Display
// ============================================================================

/** Column display mode: normal (auto-fit), full (no truncation), minimized (3 chars) */
export type ColumnDisplayMode = "normal" | "full" | "minimized"

/** A detected column from document sampling */
export interface DetectedColumn {
  field: string
  /** How many documents have this field (out of sample) */
  frequency: number
  /** Whether this column is currently visible */
  visible: boolean
  /** Display mode */
  displayMode: ColumnDisplayMode
}

/** Value types for display coloring */
export type JsonValueType =
  | "string"
  | "number"
  | "boolean"
  | "null"
  | "objectid"
  | "date"
  | "array"
  | "object"

// ============================================================================
// App State
// ============================================================================

export interface AppState {
  view: View

  // Connection info
  dbName: string
  host: string
  /** Available databases (populated when no db in URI, or after listDatabases) */
  databases: string[]
  /** When true, the palette should open in databases mode */
  dbPickerOpen: boolean

  // Filter mode: simple (field:value) or pipeline ($EDITOR)
  /** True = pipeline mode active, False = simple filter mode */
  pipelineMode: boolean
  /** Parsed pipeline stages — active when pipelineMode = true */
  pipeline: import("mongodb").Document[]
  /** Raw JSON5 source — preserved for re-opening the editor */
  pipelineSource: string
  /** True when pipeline has stages that can't be expressed as find() */
  pipelineIsAggregate: boolean
  /** When set, show the pipeline→simple confirmation dialog */
  pipelineConfirm: { simpleQuery: string } | null
  /** True while fs.watch is active on the pipeline file */
  pipelineWatching: boolean
  /** Whether the filter/pipeline bar is visible at the bottom */
  filterBarVisible: boolean
  /** How many documents are currently loaded (for paging) */
  loadedCount: number
  /** True while a background page-append fetch is in flight */
  loadingMore: boolean

  // Collection browser
  collections: CollectionInfo[]
  collectionsLoading: boolean
  collectionSelectedIndex: number

  // Tabs
  tabs: Tab[]
  activeTabId: string | null
  /** Stack of recently closed tabs for undo */
  closedTabs: Tab[]

  // Document list (per-tab, but stored here for active tab)
  documents: Document[]
  documentsLoading: boolean
  /** Count matching current filter */
  documentCount: number
  /** Total count (unfiltered) — set on initial load, preserved during filtering */
  totalDocumentCount: number
  /** Incremented to force a reload */
  reloadCounter: number
  selectedIndex: number
  selectedColumnIndex: number
  columns: DetectedColumn[]
  /** Schema map for dot-notation suggestions and smart query generation */
  schemaMap: SchemaMap
  /** Current sort: field name and direction, or null for default (_id desc) */
  sortField: string | null
  sortDirection: 1 | -1

  // Query
  queryVisible: boolean
  queryMode: QueryMode
  queryInput: string
  /** BSON sort input (only used in bson mode) */
  bsonSort: string
  /** BSON projection input (only used in bson mode) */
  bsonProjection: string
  /** Which section is focused in BSON editor */
  bsonFocusedSection: BsonSection
  /** Whether sort section is visible in BSON editor */
  bsonSortVisible: boolean
  /** Whether projection section is visible in BSON editor */
  bsonProjectionVisible: boolean
  /**
   * Incremented whenever BSON content is changed externally (mode migration,
   * format). BsonTextarea watches this to know when to push externalValue
   * into the textarea, ignoring changes that came from user typing.
   */
  bsonExternalVersion: number

  // Preview
  previewPosition: PreviewPosition
  previewScrollOffset: number

  // Command palette
  commandPaletteVisible: boolean

  // Messages
  message: { text: string; kind: "info" | "success" | "warning" | "error" } | null

  // Errors
  error: string | null

  // Selection
  selectionMode: SelectionMode
  selectedIds: Set<string>
  frozenIds: Set<string>
  selectedRows: Set<number>
  selectionAnchor: number | null

  // Bulk edit confirmation dialog (null = not showing)
  bulkEditConfirmation: BulkEditConfirmation | null
  // Delete confirmation dialog (null = not showing)
  deleteConfirmation: DeleteConfirmation | null
  // Bulk query update confirmation dialog (null = not showing)
  bulkQueryUpdateConfirmation: BulkQueryUpdateConfirmation | null
  // Bulk query delete confirmation dialog (null = not showing)
  bulkQueryDeleteConfirmation: BulkQueryDeleteConfirmation | null

  // Query history (simple mode, newest-first, loaded from disk at startup)
  historyEntries: string[]
  /** Whether the history picker overlay is open */
  historyPickerOpen: boolean
}
