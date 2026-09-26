/**
 * Column picker (spec 068): open it for the active tab and turn its checked
 * paths back into the tab's projection.
 */

import type { Dispatch } from "react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import {
  defaultColumns,
  encodeSelection,
  initialChecked,
  pickerRows,
  type PickerRow,
} from "../query/columnPicker"
import { projectionToSimple } from "../query/parser"
import { isPlainProjection } from "../query/projection"
import { applyProjection, currentProjection, projectionTarget } from "./projectionEdit"

export interface ColumnPickerModel {
  rows: PickerRow[]
  checked: string[]
}

export function columnPickerModel(state: AppState): ColumnPickerModel {
  const rows = pickerRows(
    state.schemaMap,
    state.columns.map((c) => c.field),
  )
  const projection = currentProjection(state)
  return {
    rows,
    checked: initialChecked(
      isPlainProjection(projection) ? projection : undefined,
      defaultColumns(rows),
    ),
  }
}

export function openColumnPicker(state: AppState, dispatch: Dispatch<AppAction>): void {
  if (state.view !== "documents" || state.documents.length === 0) {
    return
  }
  if (projectionTarget(state) === null) {
    dispatch({
      type: "SHOW_MESSAGE",
      message: "Column picker works in simple and pipeline mode — BSON has its projection field",
      kind: "warning",
    })
    return
  }
  const projection = currentProjection(state)
  if (projection && !isPlainProjection(projection)) {
    dispatch({
      type: "SHOW_MESSAGE",
      message: "$project computes fields — edit the pipeline instead",
      kind: "warning",
    })
    return
  }
  dispatch({ type: "OPEN_COLUMN_PICKER" })
}

export function applyColumnPicker(
  state: AppState,
  dispatch: Dispatch<AppAction>,
  checked: string[],
): void {
  dispatch({ type: "CLOSE_COLUMN_PICKER" })
  const defaults = defaultColumns(columnPickerModel(state).rows)
  const projection = encodeSelection(checked, defaults)
  if (projectionToSimple(projection) === projectionToSimple(currentProjection(state) ?? {})) {
    return
  }
  applyProjection(state, dispatch, projection)
}
