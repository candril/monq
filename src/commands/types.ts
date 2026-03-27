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
