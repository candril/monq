/**
 * Pure keymap matching helper.
 * Used by keyboard hooks to check whether a raw key event matches
 * any of the KeyCombos registered for an action.
 */

import type { KeyCombo } from "../config/types"

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
 * Returns true if the raw key event matches at least one of the given combos.
 * An empty combos array always returns false (action disabled).
 */
export function matches(key: RawKey, combos: KeyCombo[]): boolean {
  for (const combo of combos) {
    if (
      key.name === combo.name &&
      !!key.ctrl === !!combo.ctrl &&
      !!key.shift === !!combo.shift &&
      !!key.alt === !!combo.alt
    ) {
      return true
    }
  }
  return false
}
