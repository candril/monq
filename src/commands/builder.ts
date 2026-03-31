/**
 * Build all commands for the command palette based on current app state.
 */

import type { Command } from "./types"
import type { AppState } from "../types"

export function buildCommands(state: AppState): Command[] {
  const commands: Command[] = []
  const hasTab = state.activeTabId !== null
  const hasDoc = hasTab && state.documents.length > 0
  const hasSelection = state.selectedRows.size > 0

  // Navigation
  commands.push({
    id: "nav:switch-connection",
    label: "Switch Connection",
    category: "navigation",
  })
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
      label: hasSelection ? "Edit Selected Documents" : "Edit Document",
      category: "document",
      shortcut: "e",
    })
    commands.push({
      id: "doc:insert",
      label: "Insert New Document",
      category: "document",
      shortcut: "i",
    })
    commands.push({
      id: "doc:delete",
      label: hasSelection ? "Delete Selected Documents" : "Delete Document",
      category: "document",
      shortcut: "Shift+D",
    })
    commands.push({
      id: "doc:bulk-query-update",
      label: "Bulk Update (query)",
      category: "document",
      shortcut: "Ctrl+U",
    })
    commands.push({
      id: "doc:copy-cell",
      label: "Copy Cell Value",
      category: "document",
      shortcut: "y",
    })
    commands.push({
      id: "doc:copy-json",
      label: "Copy Document as JSON",
      category: "document",
      shortcut: "Y",
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
      id: "view:cycle-column-mode",
      label: "Cycle Column Width Mode",
      category: "view",
      shortcut: "w",
    })
    if (!state.pipelineMode && state.queryMode !== "bson" && state.documents.length > 0) {
      commands.push({
        id: "view:toggle-column-exclude",
        label: "Hide/Show Column (projection)",
        category: "view",
        shortcut: "-",
      })
    }
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
    commands.push({
      id: "query:open-pipeline-tmux",
      label: "Open Pipeline in Tmux Split",
      category: "query",
      shortcut: "Ctrl+E",
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

  // Tab management
  if (hasTab) {
    commands.push({
      id: "tabs:clone",
      label: "Clone Tab",
      category: "tabs",
      shortcut: "t",
    })
    commands.push({
      id: "tabs:close",
      label: "Close Tab",
      category: "tabs",
      shortcut: "d",
    })
    commands.push({
      id: "tabs:undo-close",
      label: "Undo Close Tab",
      category: "tabs",
      shortcut: "u",
    })
    if (state.tabs.length > 1) {
      commands.push({
        id: "tabs:prev",
        label: "Previous Tab",
        category: "tabs",
        shortcut: "[",
      })
      commands.push({
        id: "tabs:next",
        label: "Next Tab",
        category: "tabs",
        shortcut: "]",
      })
    }
  }

  // Selection
  if (hasDoc) {
    if (state.selectionMode === "none" || state.selectionMode === "selected") {
      commands.push({
        id: "selection:enter",
        label: "Enter Selection Mode",
        category: "selection",
        shortcut: "v",
      })
    } else {
      commands.push({
        id: "selection:freeze",
        label: "Freeze Selection",
        category: "selection",
        shortcut: "v",
      })
      commands.push({
        id: "selection:exit",
        label: "Exit Selection Mode",
        category: "selection",
        shortcut: "Esc",
      })
    }
    commands.push({
      id: "selection:select-all",
      label: "Select All",
      category: "selection",
      shortcut: "Ctrl+A",
    })
  }

  // Theme
  commands.push({
    id: "theme:pick",
    label: "Change Theme",
    category: "themes",
  })

  // Global
  commands.push({
    id: "app:quit",
    label: "Quit",
    category: "navigation",
    shortcut: "q",
  })

  return commands
}
