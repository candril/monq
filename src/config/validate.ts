/**
 * Config validation.
 * Returns a list of human-readable warning strings.
 * All issues are non-fatal — the app falls back to defaults for any invalid value.
 */

import type { UserConfig, ThemeConfig, ActionName } from "./types"

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/

const THEME_TOKENS = new Set<keyof ThemeConfig>([
  "bg",
  "headerBg",
  "modalBg",
  "overlayBg",
  "selection",
  "text",
  "textDim",
  "textMuted",
  "primary",
  "secondary",
  "success",
  "warning",
  "error",
  "border",
  "jsonKey",
  "jsonString",
  "jsonNumber",
  "jsonBoolean",
  "jsonNull",
  "jsonObjectId",
  "jsonDate",
  "jsonBracket",
  "tabActive",
  "tabInactive",
  "querySimple",
  "queryBson",
])

const ACTION_NAMES = new Set<ActionName>([
  "nav.down",
  "nav.up",
  "nav.left",
  "nav.right",
  "nav.half_page_down",
  "nav.half_page_up",
  "nav.column_mode",
  "doc.reload",
  "doc.filter_value",
  "doc.hide_column",
  "doc.sort",
  "doc.edit",
  "doc.insert",
  "doc.delete",
  "doc.yank_cell",
  "doc.yank_document",
  "preview.toggle",
  "preview.cycle_position",
  "query.open",
  "query.clear",
  "query.toggle_mode",
  "pipeline.open",
  "pipeline.open_full",
  "selection.toggle",
  "selection.toggle_row",
  "selection.jump_end",
  "selection.select_all",
  "tab.clone",
  "tab.close",
  "tab.undo_close",
  "tab.prev",
  "tab.next",
  "tab.switch_1",
  "tab.switch_2",
  "tab.switch_3",
  "tab.switch_4",
  "tab.switch_5",
  "tab.switch_6",
  "tab.switch_7",
  "tab.switch_8",
  "tab.switch_9",
  "filter_bar.toggle",
  "palette.open",
  "app.quit",
])

export function validateConfig(config: UserConfig): string[] {
  const warnings: string[] = []

  // Validate [theme] section
  if (config.theme) {
    for (const [key, value] of Object.entries(config.theme)) {
      if (!THEME_TOKENS.has(key as keyof ThemeConfig)) {
        warnings.push(`config: [theme] unknown token "${key}" — ignored`)
        continue
      }
      if (typeof value !== "string") {
        warnings.push(`config: [theme] "${key}" must be a string — ignored`)
        continue
      }
      if (!HEX_RE.test(value)) {
        warnings.push(
          `config: [theme] "${key}" = "${value}" is not a valid hex colour — ignored`,
        )
      }
    }
  }

  // Validate [keys] section
  if (config.keys) {
    for (const [action, value] of Object.entries(config.keys)) {
      if (!ACTION_NAMES.has(action as ActionName)) {
        warnings.push(`config: [keys] unknown action "${action}" — ignored`)
        continue
      }
      const combos = Array.isArray(value) ? value : [value]
      for (const combo of combos) {
        if (typeof combo !== "string") {
          warnings.push(
            `config: [keys] "${action}" contains a non-string value — ignored`,
          )
          continue
        }
        if (combo !== "" && !isValidCombo(combo)) {
          warnings.push(
            `config: [keys] "${action}" = "${combo}" is not a valid key combo — ignored`,
          )
        }
      }
    }
  }

  return warnings
}

/**
 * Very permissive combo syntax check.
 * Allows: "j", "down", "ctrl+p", "shift+f", "ctrl+shift+e", ""
 */
function isValidCombo(combo: string): boolean {
  const parts = combo.split("+")
  // All parts except the last must be valid modifiers
  const modifiers = parts.slice(0, -1)
  const key = parts[parts.length - 1]
  const validModifiers = new Set(["ctrl", "shift", "alt", "meta"])
  for (const mod of modifiers) {
    if (!validModifiers.has(mod.toLowerCase())) return false
  }
  // Key must be non-empty
  return key !== undefined && key.length > 0
}
