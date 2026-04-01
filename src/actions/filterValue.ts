/**
 * Shared action: filter by the selected cell's value.
 * Used by both the keyboard shortcut (f) and the command palette.
 */

import type { Dispatch } from "react"
import { ObjectId } from "mongodb"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { getNestedValue } from "../utils/format"
import { stageOf } from "../query/pipeline"

export function filterBySelectedValue(state: AppState, dispatch: Dispatch<AppAction>): void {
  const doc = state.documents[state.selectedIndex]
  const visCols = state.columns.filter((c) => c.visible)
  const col = visCols[state.selectedColumnIndex]
  if (!doc || !col) return

  const val = getNestedValue(doc as Record<string, unknown>, col.field) ?? null

  if (state.pipelineMode) {
    filterByValuePipeline(state, dispatch, col.field, val)
  } else {
    filterByValueSimple(state, dispatch, col.field, val)
  }
}

function filterByValuePipeline(
  state: AppState,
  dispatch: Dispatch<AppAction>,
  field: string,
  val: unknown,
): void {
  const matchStageDoc = state.pipeline.find((s) => "$match" in s)
  if (!matchStageDoc) {
    dispatch({
      type: "SHOW_MESSAGE",
      message: "Cannot add filter: pipeline has no $match stage",
      kind: "warning",
    })
    return
  }
  const matchStage = stageOf(matchStageDoc)
  if (field in (matchStage.$match ?? {})) {
    dispatch({
      type: "SHOW_MESSAGE",
      message: `${field} is already in $match — edit pipeline with Ctrl+F to change it`,
      kind: "warning",
    })
    return
  }
  const isSimpleValue =
    val === null || typeof val === "string" || typeof val === "number" || typeof val === "boolean"
  if (!isSimpleValue) {
    dispatch({
      type: "SHOW_MESSAGE",
      message: `Cannot filter by ${field}: complex value — edit pipeline with Ctrl+F`,
      kind: "warning",
    })
    return
  }
  dispatch({ type: "ADD_PIPELINE_MATCH_CONDITION", field, value: val })
}

function filterByValueSimple(
  state: AppState,
  dispatch: Dispatch<AppAction>,
  field: string,
  val: unknown,
): void {
  const alreadyFiltered = state.queryInput
    .split(" ")
    .some(
      (t) =>
        t.startsWith(`${field}:`) ||
        t.startsWith(`${field}>`) ||
        t.startsWith(`${field}<`) ||
        t.startsWith(`${field}!`),
    )
  if (alreadyFiltered) {
    dispatch({
      type: "SHOW_MESSAGE",
      message: `${field} is already in filter — use / to edit`,
      kind: "warning",
    })
    return
  }

  let formatted: string
  if (val instanceof ObjectId) {
    formatted = `ObjectId(${val.toHexString()})`
  } else if (typeof val === "string") {
    formatted = val.includes(" ") ? `"${val}"` : val
  } else {
    formatted = String(val)
  }

  const token = `${field}:${formatted}`
  const existingTokens = state.queryInput.trim().split(/\s+/).filter(Boolean)
  const filterTokens = existingTokens.filter(
    (t: string) => !t.startsWith("+") && !(t.startsWith("-") && !/[><!:]/.test(t.slice(1))),
  )
  const projTokens = existingTokens.filter(
    (t: string) => t.startsWith("+") || (t.startsWith("-") && !/[><!:]/.test(t.slice(1))),
  )
  dispatch({ type: "SET_QUERY_INPUT", input: [...filterTokens, token, ...projTokens].join(" ") })
  dispatch({ type: "SUBMIT_QUERY" })
}
