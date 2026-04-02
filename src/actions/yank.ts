/**
 * Yank (copy) actions: copy a full document or a single cell value to clipboard.
 */

import type { Dispatch } from "react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { getNestedValue, formatCellValue } from "../utils/format"
import { serializeDocument } from "../utils/document"
import { copyToClipboard } from "../utils/clipboard"

/** Copy the entire selected document (EJSON) to the clipboard. */
export function yankDocument(state: AppState, dispatch: Dispatch<AppAction>): void {
  const doc = state.documents[state.selectedIndex]
  if (!doc) {
    return
  }
  copyToClipboard(serializeDocument(doc)).catch(() => {})
  dispatch({ type: "SHOW_MESSAGE", message: "Document copied to clipboard", kind: "info" })
}

/** Copy the selected cell value to the clipboard. */
export function yankCell(state: AppState, dispatch: Dispatch<AppAction>): void {
  const doc = state.documents[state.selectedIndex]
  if (!doc) {
    return
  }
  const visCols = state.columns.filter((c) => c.visible)
  const col = visCols[state.selectedColumnIndex]
  if (!col) {
    return
  }
  const val = getNestedValue(doc as Record<string, unknown>, col.field)
  const text = formatCellValue(val)
  copyToClipboard(text).catch(() => {})
  dispatch({ type: "SHOW_MESSAGE", message: `Copied ${col.field} to clipboard`, kind: "info" })
}
