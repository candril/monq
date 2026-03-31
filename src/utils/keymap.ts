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
