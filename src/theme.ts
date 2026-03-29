// Tokyo Night inspired color palette
import type { ThemeConfig } from "./config/types"

export type Theme = typeof tokyoNight

const tokyoNight = {
  // Backgrounds
  bg: "#1a1b26",
  headerBg: "#24283b",
  modalBg: "#16161e",
  overlayBg: "#00000080",
  selection: "#33467c",

  // Text
  text: "#c0caf5",
  textDim: "#565f89",
  textMuted: "#414868",

  // Accents
  primary: "#7aa2f7",
  secondary: "#bb9af7",
  success: "#9ece6a",
  warning: "#e0af68",
  error: "#f7768e",

  // Borders
  border: "#414868",

  // JSON value type colors
  jsonKey: "#7aa2f7",
  jsonString: "#9ece6a",
  jsonNumber: "#ff9e64",
  jsonBoolean: "#bb9af7",
  jsonNull: "#565f89",
  jsonObjectId: "#e0af68",
  jsonDate: "#e0af68",
  jsonBracket: "#565f89",

  // Tab colors
  tabActive: "#7aa2f7",
  tabInactive: "#565f89",

  // Query mode indicator
  querySimple: "#9ece6a",
  queryBson: "#e0af68",
}

/**
 * Build a theme by merging user overrides onto Tokyo Night defaults.
 * Only valid overrides (already validated hex strings) are applied.
 */
export function buildTheme(overrides: Partial<ThemeConfig> = {}): Theme {
  return { ...tokyoNight, ...overrides }
}

/**
 * Module-level mutable theme reference.
 * Initialised to Tokyo Night defaults.
 * Call setTheme() once at startup (in index.tsx) to apply user config.
 * All components that import { theme } will get the overridden version
 * because the import is resolved after setTheme() is called.
 */
// eslint-disable-next-line prefer-const
export let theme: Theme = tokyoNight

/**
 * Set the module-level theme. Called once in index.tsx before the renderer starts.
 */
export function setTheme(t: Theme): void {
  theme = t
}
