/**
 * Theme commands for the theme picker sub-palette.
 * Each command ID is "theme:<preset-id>".
 */

import type { Command } from "./types"
import { THEME_PRESETS } from "../themes/index"

export function buildThemeCommands(activeThemeId: string): Command[] {
  return THEME_PRESETS.map((preset) => ({
    id: `theme:${preset.id}`,
    label: preset.name + (preset.id === activeThemeId ? " ✓" : ""),
    category: "themes" as const,
  }))
}
