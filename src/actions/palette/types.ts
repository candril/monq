/**
 * Shared context for palette action handlers.
 */

import type { Dispatch } from "react"
import type { CliRenderer } from "@opentui/core"
import type { AppState } from "../../types"
import type { AppAction } from "../../state"
import type { Theme } from "../../theme"
import type { ThemeConfig } from "../../config/types"

export interface PaletteContext {
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
