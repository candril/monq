/**
 * Toggle the _id column between ObjectId hex and its embedded creation time.
 */

import type { Dispatch } from "react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { detectValueType } from "../utils/format"

export function toggleIdAsDate(state: AppState, dispatch: Dispatch<AppAction>): void {
  if (state.idAsDate) {
    dispatch({ type: "TOGGLE_ID_AS_DATE" })
    dispatch({ type: "SHOW_MESSAGE", message: "Showing _id as ObjectId", kind: "info" })
    return
  }

  if (!state.documents.some((doc) => detectValueType(doc._id) === "objectid")) {
    dispatch({
      type: "SHOW_MESSAGE",
      message: "_id is not an ObjectId — no creation date to show",
      kind: "warning",
    })
    return
  }

  dispatch({ type: "TOGGLE_ID_AS_DATE" })
  dispatch({ type: "SHOW_MESSAGE", message: "Showing _id as creation date (UTC)", kind: "info" })
}
