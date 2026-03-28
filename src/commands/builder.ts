/**
 * Build all commands for the command palette based on current app state.
 */

import type { Command } from "./types"
import type { AppState } from "../types"

export function buildCommands(state: AppState): Command[] {
  const commands: Command[] = []
  const hasTab = state.activeTabId !== null
  const hasDoc = hasTab && state.documents.length > 0

  // Navigation
  commands.push({
    id: "nav:switch-collection",
    label: "Open Collection",
    category: "navigation",
    shortcut: "",
  })
  commands.push({
    id: "nav:switch-database",
    label: "Switch Database",
    category: "navigation",
  })

  // Document actions (only when viewing documents)
  if (hasDoc) {
    commands.push({
      id: "doc:edit",
      label: "Edit Document",
      category: "document",
      shortcut: "e",
    })
    commands.push({
      id: "doc:copy-json",
      label: "Copy Document as JSON",
      category: "document",
      shortcut: "y",
    })
    commands.push({
      id: "doc:copy-id",
      label: "Copy Document _id",
      category: "document",
    })
    commands.push({
      id: "doc:filter-value",
      label: "Filter by Selected Value",
      category: "document",
      shortcut: "f",
    })
  }

  // View actions
  if (hasTab) {
    commands.push({
      id: "view:toggle-preview",
      label: "Toggle Preview Panel",
      category: "view",
      shortcut: "p",
    })
    commands.push({
      id: "view:cycle-preview",
      label: "Cycle Preview Position",
      category: "view",
      shortcut: "P",
    })
    commands.push({
      id: "view:toggle-filter-bar",
      label: state.filterBarVisible ? "Hide Filter Bar" : "Show Filter Bar",
      category: "view",
      shortcut: "Shift+F",
    })
    commands.push({
      id: "view:reload",
      label: "Reload Documents",
      category: "view",
      shortcut: "r",
    })
  }

  // Query actions
  if (hasTab) {
    commands.push({
      id: "query:open-filter",
      label: "Filter (simple)",
      category: "query",
      shortcut: "/",
    })
    commands.push({
      id: "query:open-pipeline",
      label: "Open Pipeline Editor",
      category: "query",
      shortcut: "Ctrl+F",
    })
    if (state.pipelineMode) {
      commands.push({
        id: "query:clear-pipeline",
        label: "Clear Pipeline",
        category: "query",
        shortcut: "⌫",
      })
    }
    if (state.queryInput) {
      commands.push({
        id: "query:clear-filter",
        label: "Clear Filter",
        category: "query",
        shortcut: "⌫",
      })
    }
    if (state.queryMode === "bson") {
      commands.push({
        id: "query:format-bson",
        label: "Format BSON (pretty-print)",
        category: "query",
      })
    }
    if (hasDoc) {
      commands.push({
        id: "query:sort",
        label: "Sort by Selected Column",
        category: "query",
        shortcut: "s",
      })
    }
  }

  return commands
}
