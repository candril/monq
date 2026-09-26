/**
 * Toggle column visibility via projection ($project or simple-mode ±field).
 */

import type { Dispatch } from "react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { isInclusion, isPlainProjection } from "../query/projection"
import { applyProjection, currentProjection, projectionTarget } from "./projectionEdit"

/** Toggle column hidden/shown for the currently selected column. */
export function hideColumn(state: AppState, dispatch: Dispatch<AppAction>): void {
  const visCols = state.columns.filter((c) => c.visible)
  const col = visCols[state.selectedColumnIndex]
  if (!col || projectionTarget(state) === null) {
    return
  }
  const current = currentProjection(state)
  if (current && !isPlainProjection(current)) {
    dispatch({
      type: "SHOW_MESSAGE",
      message: "$project computes fields — edit the pipeline instead",
      kind: "warning",
    })
    return
  }

  const field = col.field
  const projection = { ...current }
  // MongoDB rejects a projection that mixes inclusions and exclusions (except
  // `_id`), so under an inclusion hiding a column means dropping its path.
  if (isInclusion(projection) && field !== "_id") {
    delete projection[field]
    dispatch({ type: "SHOW_MESSAGE", message: `Hiding ${field}`, kind: "info" })
  } else if (projection[field] === 0) {
    delete projection[field]
    dispatch({ type: "SHOW_MESSAGE", message: `Showing ${field}`, kind: "info" })
  } else {
    delete projection[field]
    projection[field] = 0
    dispatch({ type: "SHOW_MESSAGE", message: `Hiding ${field}`, kind: "info" })
  }
  applyProjection(state, dispatch, projection)
}
