/**
 * Hook: palette action dispatch.
 * Thin router that delegates to domain-specific handlers in actions/palette/.
 * App.tsx wires this hook and passes the result to CommandPalette.onSelect.
 */

import { useCallback, type Dispatch } from "react"
import type { CliRenderer } from "@opentui/core"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import type { Command } from "../commands/types"
import type { Theme } from "../theme"
import type { ThemeConfig } from "../config/types"
import { switchDatabase } from "../providers/mongodb"
import type { PaletteContext } from "../actions/palette/types"
import { handleThemeCommand } from "../actions/palette/theme"
import { handleViewCommand } from "../actions/palette/view"
import { handleQueryCommand } from "../actions/palette/query"
import { handleDocumentCommand } from "../actions/palette/document"
import { handleNavigationCommand } from "../actions/palette/navigation"

interface UsePaletteActionsOptions {
  state: AppState
  dispatch: Dispatch<AppAction>
  renderer: CliRenderer
  setPaletteMode: (mode: "commands" | "collections" | "databases" | "themes") => void
  onThemeChange: (presetId: string) => void
  applyTheme: (t: Theme) => void
  configThemeId: string | null
  configThemeOverrides: Partial<ThemeConfig>
  onCreateCollection?: (collectionName: string) => Promise<string | null>
  onRenameCollection?: (oldName: string, newName: string) => Promise<string | null>
  onDropCollection?: (collectionName: string) => Promise<string | null>
  onDropDatabase?: (dbName: string) => Promise<string | null>
}

export function usePaletteActions({
  state,
  dispatch,
  renderer,
  setPaletteMode,
  onThemeChange,
  applyTheme,
  configThemeId,
  configThemeOverrides,
  onCreateCollection,
  onRenameCollection,
  onDropCollection,
  onDropDatabase,
}: UsePaletteActionsOptions) {
  const handleSelect = useCallback(
    (cmd: Command) => {
      const ctx: PaletteContext = {
        state,
        dispatch,
        renderer,
        setPaletteMode,
        onThemeChange,
        applyTheme,
        configThemeId,
        configThemeOverrides,
        onCreateCollection,
        onRenameCollection,
        onDropCollection,
        onDropDatabase,
      }

      // Database selection — switch to collection picker
      if (cmd.id.startsWith("db:")) {
        const selectedDb = cmd.id.slice(3)
        switchDatabase(selectedDb)
        dispatch({ type: "SELECT_DATABASE", dbName: selectedDb })
        setPaletteMode("collections")
        return
      }

      // Collection selection
      if (cmd.id.startsWith("open:")) {
        dispatch({ type: "CLOSE_COMMAND_PALETTE" })
        setPaletteMode("commands")
        dispatch({ type: "OPEN_TAB", collectionName: cmd.id.slice(5) })
        return
      }

      // Route to domain handlers
      if (handleThemeCommand(cmd.id, ctx)) return
      if (handleViewCommand(cmd.id, ctx)) return
      if (handleQueryCommand(cmd.id, ctx)) return
      if (handleDocumentCommand(cmd.id, ctx)) return
      if (handleNavigationCommand(cmd.id, ctx)) return

      // Fallback
      dispatch({ type: "CLOSE_COMMAND_PALETTE" })
    },
    [
      state,
      dispatch,
      renderer,
      setPaletteMode,
      onThemeChange,
      applyTheme,
      configThemeId,
      configThemeOverrides,
      onCreateCollection,
      onRenameCollection,
      onDropCollection,
      onDropDatabase,
    ],
  )

  return { handleSelect }
}
