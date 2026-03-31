/**
 * Types for the configuration system (spec 033).
 *
 * UserConfig     — raw user-supplied values (all optional)
 * ResolvedConfig — merged result of user config + defaults (all present)
 * ThemeConfig    — subset of theme tokens, all hex strings
 * KeysConfig     — action name → one or more key combo strings
 * KeyCombo       — parsed key combo (modifier flags + key name)
 * Keymap         — action name → KeyCombo[] lookup (used by hooks)
 */

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/** All configurable theme tokens. Every field is optional in UserConfig. */
export interface ThemeConfig {
  bg: string
  headerBg: string
  modalBg: string
  overlayBg: string
  selection: string
  text: string
  textDim: string
  textMuted: string
  primary: string
  secondary: string
  success: string
  warning: string
  error: string
  border: string
  jsonKey: string
  jsonString: string
  jsonNumber: string
  jsonBoolean: string
  jsonNull: string
  jsonObjectId: string
  jsonDate: string
  jsonBracket: string
  tabActive: string
  tabInactive: string
  querySimple: string
  queryBson: string
}

// ---------------------------------------------------------------------------
// Keybindings
// ---------------------------------------------------------------------------

/** All remappable action names. */
export type ActionName =
  | "nav.down"
  | "nav.up"
  | "nav.left"
  | "nav.right"
  | "nav.half_page_down"
  | "nav.half_page_up"
  | "nav.column_mode"
  | "doc.reload"
  | "doc.filter_value"
  | "doc.hide_column"
  | "doc.sort"
  | "doc.edit"
  | "doc.insert"
  | "doc.delete"
  | "doc.bulk_query_update"
  | "doc.bulk_query_delete"
  | "doc.yank_cell"
  | "doc.yank_document"
  | "preview.toggle"
  | "preview.cycle_position"
  | "query.open"
  | "query.clear"
  | "query.toggle_mode"
  | "pipeline.open"
  | "pipeline.open_full"
  | "selection.toggle"
  | "selection.toggle_row"
  | "selection.jump_end"
  | "selection.select_all"
  | "tab.clone"
  | "tab.close"
  | "tab.undo_close"
  | "tab.prev"
  | "tab.next"
  | "tab.switch_1"
  | "tab.switch_2"
  | "tab.switch_3"
  | "tab.switch_4"
  | "tab.switch_5"
  | "tab.switch_6"
  | "tab.switch_7"
  | "tab.switch_8"
  | "tab.switch_9"
  | "filter_bar.toggle"
  | "palette.open"
  | "index.open"
  | "explain.run"
  | "app.quit"

/** Raw user-supplied keys config — each action maps to a string or string[]. */
export type KeysConfig = Partial<Record<ActionName, string | string[]>>

/**
 * Parsed key combo.
 * name: the key name (e.g. "j", "down", "p", "f")
 * ctrl / shift / alt: modifier flags
 */
export interface KeyCombo {
  name: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
}

/** Resolved keymap: every action has an array of KeyCombos (may be empty if disabled). */
export type Keymap = Record<ActionName, KeyCombo[]>

// ---------------------------------------------------------------------------
// Top-level config shapes
// ---------------------------------------------------------------------------

/** Raw user config as parsed from TOML — everything optional. */
export interface UserConfig {
  /** Named theme preset, e.g. "catppuccin-mocha". Applied before [theme] token overrides. */
  themePreset?: string
  theme?: Partial<ThemeConfig>
  keys?: KeysConfig
}

/** Fully resolved config after merging with defaults. */
export interface ResolvedConfig {
  /** The preset ID from config.toml (if any). Used as the reset target. */
  configThemeId: string | null
  theme: Partial<ThemeConfig>
  keymap: Keymap
  /** Startup warnings to surface as toasts (validation issues). */
  warnings: string[]
}
