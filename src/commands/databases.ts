/**
 * Build database commands for the command palette.
 */

import type { Command } from "./types"

export function buildDatabaseCommands(databases: string[], currentDb?: string): Command[] {
  return databases.map((db) => ({
    id: `db:${db}`,
    label: db,
    category: "database",
    shortcut: db === currentDb ? "current" : undefined,
  }))
}
