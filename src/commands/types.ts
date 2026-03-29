/**
 * Generic command types for the command palette.
 */

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
  "themes",
] as const

export type CommandCategory = (typeof CATEGORY_ORDER)[number]

export interface Command {
  id: string
  label: string
  category: CommandCategory
  /** Optional keyboard shortcut hint (display only) */
  shortcut?: string
}
