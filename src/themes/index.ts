/**
 * Built-in theme presets.
 * Each preset is a full Theme object (all tokens present).
 * New presets can be added here without any other changes.
 */

import type { Theme } from "../theme"

export interface ThemePreset {
  /** Stable ID used in commands — e.g. "tokyo-night" */
  id: string
  /** Human-readable display name */
  name: string
  theme: Theme
}

// ---------------------------------------------------------------------------
// Tokyo Night (default)
// ---------------------------------------------------------------------------
const tokyoNight: Theme = {
  bg: "#1a1b26",
  headerBg: "#24283b",
  modalBg: "#16161e",
  overlayBg: "#00000080",
  selection: "#33467c",
  text: "#c0caf5",
  textDim: "#565f89",
  textMuted: "#414868",
  primary: "#7aa2f7",
  secondary: "#bb9af7",
  success: "#9ece6a",
  warning: "#e0af68",
  error: "#f7768e",
  border: "#414868",
  jsonKey: "#7aa2f7",
  jsonString: "#9ece6a",
  jsonNumber: "#ff9e64",
  jsonBoolean: "#bb9af7",
  jsonNull: "#565f89",
  jsonObjectId: "#e0af68",
  jsonDate: "#e0af68",
  jsonBracket: "#565f89",
  tabActive: "#7aa2f7",
  tabInactive: "#565f89",
  querySimple: "#9ece6a",
  queryBson: "#e0af68",
}

// ---------------------------------------------------------------------------
// Catppuccin Mocha
// ---------------------------------------------------------------------------
const catppuccinMocha: Theme = {
  bg: "#1e1e2e",
  headerBg: "#313244",
  modalBg: "#181825",
  overlayBg: "#00000080",
  selection: "#45475a",
  text: "#cdd6f4",
  textDim: "#6c7086",
  textMuted: "#585b70",
  primary: "#89b4fa",
  secondary: "#cba6f7",
  success: "#a6e3a1",
  warning: "#fab387",
  error: "#f38ba8",
  border: "#45475a",
  jsonKey: "#89b4fa",
  jsonString: "#a6e3a1",
  jsonNumber: "#fab387",
  jsonBoolean: "#cba6f7",
  jsonNull: "#6c7086",
  jsonObjectId: "#f9e2af",
  jsonDate: "#f9e2af",
  jsonBracket: "#6c7086",
  tabActive: "#89b4fa",
  tabInactive: "#6c7086",
  querySimple: "#a6e3a1",
  queryBson: "#fab387",
}

// ---------------------------------------------------------------------------
// Catppuccin Latte (light)
// ---------------------------------------------------------------------------
const catppuccinLatte: Theme = {
  bg: "#eff1f5",
  headerBg: "#e6e9ef",
  modalBg: "#dce0e8",
  overlayBg: "#00000040",
  selection: "#acb0be",
  text: "#4c4f69",
  textDim: "#9ca0b0",
  textMuted: "#bcc0cc",
  primary: "#1e66f5",
  secondary: "#8839ef",
  success: "#40a02b",
  warning: "#df8e1d",
  error: "#d20f39",
  border: "#bcc0cc",
  jsonKey: "#1e66f5",
  jsonString: "#40a02b",
  jsonNumber: "#fe640b",
  jsonBoolean: "#8839ef",
  jsonNull: "#9ca0b0",
  jsonObjectId: "#df8e1d",
  jsonDate: "#df8e1d",
  jsonBracket: "#9ca0b0",
  tabActive: "#1e66f5",
  tabInactive: "#9ca0b0",
  querySimple: "#40a02b",
  queryBson: "#df8e1d",
}

// ---------------------------------------------------------------------------
// Gruvbox Dark
// ---------------------------------------------------------------------------
const gruvboxDark: Theme = {
  bg: "#282828",
  headerBg: "#3c3836",
  modalBg: "#1d2021",
  overlayBg: "#00000080",
  selection: "#504945",
  text: "#ebdbb2",
  textDim: "#928374",
  textMuted: "#665c54",
  primary: "#83a598",
  secondary: "#d3869b",
  success: "#b8bb26",
  warning: "#fabd2f",
  error: "#fb4934",
  border: "#504945",
  jsonKey: "#83a598",
  jsonString: "#b8bb26",
  jsonNumber: "#fe8019",
  jsonBoolean: "#d3869b",
  jsonNull: "#928374",
  jsonObjectId: "#fabd2f",
  jsonDate: "#fabd2f",
  jsonBracket: "#928374",
  tabActive: "#83a598",
  tabInactive: "#928374",
  querySimple: "#b8bb26",
  queryBson: "#fabd2f",
}

// ---------------------------------------------------------------------------
// Nord
// ---------------------------------------------------------------------------
const nord: Theme = {
  bg: "#2e3440",
  headerBg: "#3b4252",
  modalBg: "#242933",
  overlayBg: "#00000080",
  selection: "#434c5e",
  text: "#eceff4",
  textDim: "#616e88",
  textMuted: "#4c566a",
  primary: "#88c0d0",
  secondary: "#b48ead",
  success: "#a3be8c",
  warning: "#ebcb8b",
  error: "#bf616a",
  border: "#434c5e",
  jsonKey: "#88c0d0",
  jsonString: "#a3be8c",
  jsonNumber: "#d08770",
  jsonBoolean: "#b48ead",
  jsonNull: "#616e88",
  jsonObjectId: "#ebcb8b",
  jsonDate: "#ebcb8b",
  jsonBracket: "#616e88",
  tabActive: "#88c0d0",
  tabInactive: "#616e88",
  querySimple: "#a3be8c",
  queryBson: "#ebcb8b",
}

// ---------------------------------------------------------------------------
// Dracula
// ---------------------------------------------------------------------------
const dracula: Theme = {
  bg: "#282a36",
  headerBg: "#383a59",
  modalBg: "#21222c",
  overlayBg: "#00000080",
  selection: "#44475a",
  text: "#f8f8f2",
  textDim: "#6272a4",
  textMuted: "#44475a",
  primary: "#8be9fd",
  secondary: "#bd93f9",
  success: "#50fa7b",
  warning: "#ffb86c",
  error: "#ff5555",
  border: "#44475a",
  jsonKey: "#8be9fd",
  jsonString: "#50fa7b",
  jsonNumber: "#ffb86c",
  jsonBoolean: "#bd93f9",
  jsonNull: "#6272a4",
  jsonObjectId: "#f1fa8c",
  jsonDate: "#f1fa8c",
  jsonBracket: "#6272a4",
  tabActive: "#8be9fd",
  tabInactive: "#6272a4",
  querySimple: "#50fa7b",
  queryBson: "#ffb86c",
}

// ---------------------------------------------------------------------------
// Solarized Dark
// ---------------------------------------------------------------------------
const solarizedDark: Theme = {
  bg: "#002b36",
  headerBg: "#073642",
  modalBg: "#00212b",
  overlayBg: "#00000080",
  selection: "#094958",
  text: "#839496",
  textDim: "#586e75",
  textMuted: "#073642",
  primary: "#268bd2",
  secondary: "#6c71c4",
  success: "#859900",
  warning: "#b58900",
  error: "#dc322f",
  border: "#073642",
  jsonKey: "#268bd2",
  jsonString: "#859900",
  jsonNumber: "#cb4b16",
  jsonBoolean: "#6c71c4",
  jsonNull: "#586e75",
  jsonObjectId: "#b58900",
  jsonDate: "#b58900",
  jsonBracket: "#586e75",
  tabActive: "#268bd2",
  tabInactive: "#586e75",
  querySimple: "#859900",
  queryBson: "#b58900",
}

// ---------------------------------------------------------------------------
// One Dark Pro
// ---------------------------------------------------------------------------
const oneDarkPro: Theme = {
  bg: "#282c34",
  headerBg: "#2c313c",
  modalBg: "#21252b",
  overlayBg: "#00000080",
  selection: "#3e4451",
  text: "#abb2bf",
  textDim: "#5c6370",
  textMuted: "#3e4451",
  primary: "#61afef",
  secondary: "#c678dd",
  success: "#98c379",
  warning: "#e5c07b",
  error: "#e06c75",
  border: "#3e4451",
  jsonKey: "#61afef",
  jsonString: "#98c379",
  jsonNumber: "#d19a66",
  jsonBoolean: "#c678dd",
  jsonNull: "#5c6370",
  jsonObjectId: "#e5c07b",
  jsonDate: "#e5c07b",
  jsonBracket: "#5c6370",
  tabActive: "#61afef",
  tabInactive: "#5c6370",
  querySimple: "#98c379",
  queryBson: "#e5c07b",
}

// ---------------------------------------------------------------------------
// Preset registry
// ---------------------------------------------------------------------------

export const THEME_PRESETS: ThemePreset[] = [
  { id: "tokyo-night", name: "Tokyo Night", theme: tokyoNight },
  { id: "catppuccin-mocha", name: "Catppuccin Mocha", theme: catppuccinMocha },
  { id: "catppuccin-latte", name: "Catppuccin Latte", theme: catppuccinLatte },
  { id: "gruvbox-dark", name: "Gruvbox Dark", theme: gruvboxDark },
  { id: "nord", name: "Nord", theme: nord },
  { id: "dracula", name: "Dracula", theme: dracula },
  { id: "solarized-dark", name: "Solarized Dark", theme: solarizedDark },
  { id: "one-dark-pro", name: "One Dark Pro", theme: oneDarkPro },
]

export function findPreset(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find((p) => p.id === id)
}
