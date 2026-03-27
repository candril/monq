/**
 * Type definitions for Mon-Q
 */

import type { Document, ObjectId } from "mongodb"

// ============================================================================
// Views
// ============================================================================

/** Top-level views */
export type View = "collections" | "documents"

/** Preview panel position */
export type PreviewPosition = "right" | "bottom" | null

/** Query mode */
export type QueryMode = "simple" | "bson"

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
  selectedIndex: number
  scrollOffset: number
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

  // Collection browser
  collections: CollectionInfo[]
  collectionsLoading: boolean
  collectionSelectedIndex: number

  // Tabs
  tabs: Tab[]
  activeTabId: string | null

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

  // Query
  queryVisible: boolean
  queryMode: QueryMode
  queryInput: string

  // Preview
  previewPosition: PreviewPosition
  previewScrollOffset: number

  // Command palette
  commandPaletteVisible: boolean

  // Messages
  message: string | null

  // Errors
  error: string | null
}
