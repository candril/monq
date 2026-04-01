/** Palette handlers: navigation, tabs, selection, manage, and app lifecycle */

import type { PaletteContext } from "./types"
import { switchToTab } from "../../utils/tabs"
import { stopWatching } from "../pipelineWatch"
import { disconnect, listDatabases, switchDatabase } from "../../providers/mongodb"
import { switchConnection } from "../../navigation"
import {
  promptCreateCollection,
  promptRenameCollection,
  promptDropCollection,
  promptDropDatabase,
} from "../database"

export function handleNavigationCommand(cmdId: string, ctx: PaletteContext): boolean {
  const { state, dispatch, renderer, setPaletteMode, onCreateCollection, onRenameCollection, onDropCollection, onDropDatabase } = ctx

  switch (cmdId) {
    case "nav:switch-connection":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      switchConnection()
      return true
    case "nav:switch-database":
      listDatabases()
        .then((databases) => {
          dispatch({ type: "SET_DATABASES", databases })
          setPaletteMode("databases")
        })
        .catch((err: Error) => {
          dispatch({ type: "CLOSE_COMMAND_PALETTE" })
          dispatch({ type: "SET_ERROR", error: `Failed to list databases: ${err.message}` })
        })
      return true
    case "nav:switch-collection":
      setPaletteMode("collections")
      return true

    // Tabs
    case "tabs:clone":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      dispatch({ type: "CLONE_TAB" })
      return true
    case "tabs:close":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      if (state.activeTabId) dispatch({ type: "CLOSE_TAB", tabId: state.activeTabId })
      return true
    case "tabs:undo-close":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      dispatch({ type: "UNDO_CLOSE_TAB" })
      return true
    case "tabs:prev": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const currentIndex = state.tabs.findIndex((t) => t.id === state.activeTabId)
      if (currentIndex > 0) switchToTab(state.tabs[currentIndex - 1].id, dispatch)
      return true
    }
    case "tabs:next": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      const currentIndex = state.tabs.findIndex((t) => t.id === state.activeTabId)
      if (currentIndex < state.tabs.length - 1) switchToTab(state.tabs[currentIndex + 1].id, dispatch)
      return true
    }

    // Selection
    case "selection:enter":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      dispatch({ type: "ENTER_SELECTION_MODE" })
      return true
    case "selection:freeze":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      dispatch({ type: "FREEZE_SELECTION" })
      return true
    case "selection:exit":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      dispatch({ type: "EXIT_SELECTION_MODE" })
      return true
    case "selection:select-all":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      dispatch({ type: "SELECT_ALL" })
      return true

    // Collection/database management
    case "manage:create-collection":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      setPaletteMode("commands")
      if (onCreateCollection) promptCreateCollection(dispatch, onCreateCollection)
      return true
    case "manage:rename-collection": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      setPaletteMode("commands")
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (activeTab && onRenameCollection) promptRenameCollection(dispatch, activeTab.collectionName, onRenameCollection)
      return true
    }
    case "manage:drop-collection": {
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      setPaletteMode("commands")
      const activeTab = state.tabs.find((t) => t.id === state.activeTabId)
      if (activeTab && onDropCollection) promptDropCollection(dispatch, activeTab.collectionName, onDropCollection)
      return true
    }
    case "manage:drop-database":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      setPaletteMode("commands")
      if (state.dbName && onDropDatabase) promptDropDatabase(dispatch, state.dbName, onDropDatabase)
      return true

    // Theme picker
    case "theme:pick":
      setPaletteMode("themes")
      return true

    // App lifecycle
    case "app:quit":
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
      stopWatching()
      disconnect().catch(() => {})
      renderer.destroy()
      process.exit(0)
      return true

    default:
      return false
  }
}
