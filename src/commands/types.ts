/**
 * Generic command types for the command palette.
 */

export interface Command {
  id: string
  label: string
  category: string
  /** Optional keyboard shortcut hint (display only) */
  shortcut?: string
}

/** Standard command categories (controls display order) */
export const CATEGORY_ORDER = [
  "navigation",
  "document",
  "view",
  "query",
  "tabs",
  "selection",
  "database",
  "collection",
] as const
