/**
 * Connects the column picker to app state: opens it on the active tab's
 * schema and projection, and writes the choice back as a projection.
 */

import { useState, type Dispatch } from "react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { applyColumnPicker, columnPickerModel } from "../actions/columnPicker"
import { defaultColumns } from "../query/columnPicker"
import { ColumnPicker } from "./ColumnPicker"

interface ColumnPickerOverlayProps {
  state: AppState
  dispatch: Dispatch<AppAction>
}

export function ColumnPickerOverlay({ state, dispatch }: ColumnPickerOverlayProps) {
  // Snapshot on open: a reload landing mid-pick must not reset the checkboxes.
  const [model] = useState(() => columnPickerModel(state))
  return (
    <ColumnPicker
      rows={model.rows}
      initialChecked={model.checked}
      defaults={defaultColumns(model.rows)}
      onApply={(checked) => applyColumnPicker(state, dispatch, checked)}
      onClose={() => dispatch({ type: "CLOSE_COLUMN_PICKER" })}
    />
  )
}
