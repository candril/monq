/**
 * Type definitions for Mon-Q
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
  focusedIndex: number
  resolve: (missingAction: "ignore" | "delete", addedAction: "ignore" | "insert") => void
  goBack: () => void
}

/** Pending delete confirmation */
export interface DeleteConfirmation {
  docs: import("mongodb").Document[]
  focusedIndex: number
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
  pipelineConfirm: { simpleQuery: string; focusedIndex: number } | null

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
}
