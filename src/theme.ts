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

/**
 * Fixed colour palette for mark letters. Each letter always maps to the same
 * colour (a → red, b → peach, …), cycling for letters past the palette.
 * Catppuccin Mocha — matches presto's `MARK_PALETTE`.
 */
const MARK_PALETTE = [
  "#f38ba8", // red
  "#fab387", // peach
  "#f9e2af", // yellow
  "#a6e3a1", // green
  "#94e2d5", // teal
  "#89dceb", // sky
  "#89b4fa", // blue
  "#cba6f7", // mauve
]

/** Stable per-letter colour for mark gutters. */
export function getMarkColor(letter: string): string {
  const index = letter.charCodeAt(0) - "a".charCodeAt(0)
  if (index < 0) {
    return MARK_PALETTE[0]
  }
  return MARK_PALETTE[index % MARK_PALETTE.length]
}
