/**
 * Pure keymap matching helper.
 * Used by keyboard hooks to check whether a raw key event matches
 * any of the KeyCombos registered for an action.
 */

import type { ActionName, KeyCombo, Keymap } from "../config/types"

/**
 * Raw key event as received from @opentui/react useKeyboard.
 * We only look at the fields we need; extra fields are ignored.
 */
export interface RawKey {
  name: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
  sequence?: string
}

/**
 * Format a single KeyCombo as a short display hint.
 *
 * Rules:
 * - Ctrl modifier → "Ctrl+X"  (e.g. ctrl+p → "Ctrl+P")
 * - Shift on a letter → uppercase letter only, no "Shift+" prefix
 *   (e.g. shift+d → "D",  shift+y → "Y")
 * - Shift on a non-letter → "Shift+<key>"
 * - Alt modifier → "Alt+X"
 * - Plain letter → lowercase  (e.g. "e", "y", "/")
 * - Special keys (backspace, tab, …) → kept as-is
 *
 * Returns an empty string if the combo is undefined.
 */
export function formatKeyHint(combo: KeyCombo | undefined): string {
  if (!combo) return ""

  const isLetter = combo.name.length === 1 && /[a-z]/i.test(combo.name)

  // Shift on a single letter → just uppercase the letter, no prefix needed
  if (combo.shift && isLetter && !combo.ctrl && !combo.alt) {
    return combo.name.toUpperCase()
  }

  const parts: string[] = []
  if (combo.ctrl) parts.push("Ctrl")
  if (combo.alt) parts.push("Alt")
  if (combo.shift) parts.push("Shift")

  // Single letters stay lowercase; special key names kept as-is
  const key = isLetter ? combo.name.toLowerCase() : combo.name

  if (parts.length === 0) return key
  return parts.join("+") + "+" + key
}

/**
 * Return the formatted hint for the first binding of a given action,
 * or an empty string if the action has no bindings.
 */
export function hintFor(keymap: Keymap, action: ActionName): string {
  return formatKeyHint(keymap[action]?.[0])
}

/**
 * Returns true if the raw key event matches at least one of the given combos.
 * An empty combos array always returns false (action disabled).
 */
export function matches(key: RawKey, combos: KeyCombo[]): boolean {
  const keyName = key.name?.toLowerCase() ?? ""
  // Detect implicit shift: if name is uppercase and shift flag is not set,
  // treat it as shift+lowercase (some terminals send "X" instead of shift+"x")
  const implicitShift = key.name?.length === 1 && key.name !== keyName && !key.shift
  const keyShift = !!key.shift || implicitShift

  for (const combo of combos) {
    if (
      keyName === combo.name &&
      !!key.ctrl === !!combo.ctrl &&
      keyShift === !!combo.shift &&
      !!key.alt === !!combo.alt
    ) {
      return true
    }
  }
  return false
}
