/**
 * Theme commands for the theme picker sub-palette.
 * Each preset command ID is "theme:<preset-id>".
 * The reset command ID is "theme:reset".
 */

import type { Command } from "./types"
import { THEME_PRESETS } from "../themes/index"

export function buildThemeCommands(activeThemeId: string): Command[] {
  const presets: Command[] = THEME_PRESETS.map((preset) => ({
    id: `theme:${preset.id}`,
    label: preset.name + (preset.id === activeThemeId ? " ✓" : ""),
    category: "themes" as const,
  }))

  const reset: Command = {
    id: "theme:reset",
    label: "Reset to config default",
    category: "themes" as const,
  }

  return [...presets, reset]
}
