/**
 * Build collection commands for the command palette.
 */

import type { Command } from "./types"
import type { CollectionInfo } from "../types"

export function buildCollectionCommands(collections: CollectionInfo[]): Command[] {
  return collections.map((col) => ({
    id: `open:${col.name}`,
    label: col.name,
    category: "collections",
    shortcut: col.type !== "collection" ? col.type : undefined,
  }))
}
