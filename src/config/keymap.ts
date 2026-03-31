/**
 * Keymap builder.
 * Takes user-supplied [keys] config and returns a full Keymap (all actions → KeyCombo[]).
 * Any action not overridden keeps its default binding(s).
 * An empty array disables all bindings for that action.
 */

import type { ActionName, KeyCombo, Keymap, KeysConfig } from "./types"

// ---------------------------------------------------------------------------
// Default bindings
// ---------------------------------------------------------------------------

/** Default keymap — every action mapped to its default key combo(s). */
const DEFAULT_BINDINGS: Record<ActionName, string[]> = {
  "nav.down": ["j", "down"],
  "nav.up": ["k", "up"],
  "nav.left": ["h", "left"],
  "nav.right": ["l", "right"],
  "nav.half_page_down": ["ctrl+d"],
  "nav.half_page_up": ["ctrl+u"],
  "nav.column_mode": ["w"],
  "doc.reload": ["r"],
  "doc.filter_value": ["f"],
  "doc.hide_column": ["-"],
  "doc.sort": ["s"],
  "doc.edit": ["e"],
  "doc.insert": ["i"],
  "doc.delete": ["shift+d"],
  "doc.bulk_query_update": [], // no default binding — use command palette
  "doc.bulk_query_delete": [], // no default binding — use command palette
  "doc.yank_cell": ["y"],
  "doc.yank_document": ["shift+y"],
  "preview.toggle": ["p"],
  "preview.cycle_position": ["shift+p"],
  "query.open": ["/"],
  "query.clear": ["backspace"],
  "query.toggle_mode": ["tab"],
  "pipeline.open": ["ctrl+f"],
  "pipeline.open_full": ["ctrl+e"],
  "selection.toggle": ["v"],
  "selection.toggle_row": ["space"],
  "selection.jump_end": ["o"],
  "selection.select_all": ["ctrl+a"],
  "tab.clone": ["t"],
  "tab.close": ["d"],
  "tab.undo_close": ["u"],
  "tab.prev": ["["],
  "tab.next": ["]"],
  "tab.switch_1": ["1"],
  "tab.switch_2": ["2"],
  "tab.switch_3": ["3"],
  "tab.switch_4": ["4"],
  "tab.switch_5": ["5"],
  "tab.switch_6": ["6"],
  "tab.switch_7": ["7"],
  "tab.switch_8": ["8"],
  "tab.switch_9": ["9"],
  "filter_bar.toggle": ["shift+f"],
  "palette.open": ["ctrl+p"],
  "index.open": ["shift+i"],
  "explain.run": ["x"],
  "app.quit": ["q"],
}

// ---------------------------------------------------------------------------
// Combo parsing
// ---------------------------------------------------------------------------

/**
 * Parse a key combo string into a KeyCombo struct.
 * Examples: "j" → {name:"j"}, "ctrl+p" → {name:"p", ctrl:true},
 *           "shift+d" → {name:"d", shift:true}
 */
export function parseCombo(combo: string): KeyCombo {
  const parts = combo.toLowerCase().split("+")
  const name = parts[parts.length - 1] ?? ""
  const modifiers = new Set(parts.slice(0, -1))
  return {
    name,
    ctrl: modifiers.has("ctrl") || undefined,
    shift: modifiers.has("shift") || undefined,
    alt: modifiers.has("alt") || undefined,
  }
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build a full Keymap from optional user [keys] config.
 * - Unset actions keep their defaults.
 * - Actions set to [] or [""] are disabled (empty array).
 */
export function buildKeymap(keys: KeysConfig = {}): Keymap {
  const keymap = {} as Keymap

  for (const [action, defaultCombos] of Object.entries(DEFAULT_BINDINGS) as [
    ActionName,
    string[],
  ][]) {
    if (action in keys) {
      const userValue = keys[action]
      // Normalise to array
      const userCombos: string[] = Array.isArray(userValue) ? userValue : [userValue as string]
      // Filter out empty strings (disable marker) and parse
      keymap[action] = userCombos.filter((c) => c !== "").map(parseCombo)
    } else {
      keymap[action] = defaultCombos.map(parseCombo)
    }
  }

  return keymap
}
