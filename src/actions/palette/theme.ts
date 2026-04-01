/** Palette handlers: theme selection and reset */

import type { PaletteContext } from "./types"
import { findPreset } from "../../themes/index"
import { buildTheme } from "../../theme"
import { saveStateTheme, clearStateTheme } from "../../state/theme"

export function handleThemeCommand(cmdId: string, ctx: PaletteContext): boolean {
  if (!cmdId.startsWith("theme:") || cmdId === "theme:pick") return false
  const {
    dispatch,
    setPaletteMode,
    applyTheme,
    onThemeChange,
    configThemeId,
    configThemeOverrides,
  } = ctx

  if (cmdId === "theme:reset") {
    const resetPresetId = configThemeId ?? "tokyo-night"
    const resetPreset = findPreset(resetPresetId)
    if (resetPreset) {
      applyTheme(buildTheme({ ...resetPreset.theme, ...configThemeOverrides }))
      onThemeChange(resetPresetId)
    }
    clearStateTheme().catch(() => {})
    dispatch({ type: "CLOSE_COMMAND_PALETTE" })
    setPaletteMode("commands")
    dispatch({ type: "SHOW_MESSAGE", message: "Theme reset to config default", kind: "info" })
    return true
  }

  const presetId = cmdId.slice(6)
  const preset = findPreset(presetId)
  if (preset) {
    applyTheme(buildTheme({ ...preset.theme, ...configThemeOverrides }))
    onThemeChange(presetId)
    saveStateTheme(presetId).catch(() => {})
    dispatch({ type: "CLOSE_COMMAND_PALETTE" })
    setPaletteMode("commands")
    dispatch({ type: "SHOW_MESSAGE", message: `Theme: ${preset.name}`, kind: "info" })
  }
  return true
}
