/**
 * Toggle column visibility via projection ($project or simple-mode ±field).
 */

import type { Dispatch } from "react"
import type { Document } from "mongodb"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { projectionToSimple, parseSimpleQueryFull } from "../query/parser"
import { classifyPipeline, stageOf } from "../query/pipeline"

/** Toggle column hidden/shown for the currently selected column. */
export function hideColumn(state: AppState, dispatch: Dispatch<AppAction>): void {
  const visCols = state.columns.filter((c) => c.visible)
  const col = visCols[state.selectedColumnIndex]
  if (!col) {
    return
  }

  if (state.pipelineMode) {
    hideColumnPipeline(state, dispatch, col.field)
  } else if (state.queryMode !== "bson") {
    hideColumnSimple(state, dispatch, col.field)
  }
}

function hideColumnPipeline(state: AppState, dispatch: Dispatch<AppAction>, field: string): void {
  const existingProjIdx = state.pipeline.findIndex((s) => "$project" in s)
  const existingProj: Record<string, 0 | 1> =
    existingProjIdx !== -1
      ? { ...(stageOf(state.pipeline[existingProjIdx]).$project as Record<string, 0 | 1>) }
      : {}

  if (existingProj[field] === 0) {
    delete existingProj[field]
    dispatch({ type: "SHOW_MESSAGE", message: `Showing ${field}`, kind: "info" })
  } else {
    existingProj[field] = 0
    dispatch({ type: "SHOW_MESSAGE", message: `Hiding ${field}`, kind: "info" })
  }

  let newPipeline: Document[]
  if (Object.keys(existingProj).length === 0) {
    newPipeline = state.pipeline.filter((_, i) => i !== existingProjIdx)
  } else if (existingProjIdx !== -1) {
    newPipeline = state.pipeline.map((s, i) =>
      i === existingProjIdx ? { $project: existingProj } : s,
    )
  } else {
    newPipeline = [...state.pipeline, { $project: existingProj }]
  }

  const newSource = JSON.stringify({ pipeline: newPipeline }, null, 2)
  dispatch({
    type: "SET_PIPELINE",
    pipeline: newPipeline,
    source: newSource,
    isAggregate: classifyPipeline(newPipeline),
  })
}

function hideColumnSimple(state: AppState, dispatch: Dispatch<AppAction>, field: string): void {
  const { projection: projObj } = parseSimpleQueryFull(state.queryInput)
  const proj: Record<string, 0 | 1> = { ...(projObj ?? {}) }

  if (proj[field] === 0) {
    delete proj[field]
    dispatch({ type: "SHOW_MESSAGE", message: `Showing ${field}`, kind: "info" })
  } else {
    delete proj[field]
    proj[field] = 0
    dispatch({ type: "SHOW_MESSAGE", message: `Hiding ${field}`, kind: "info" })
  }

  const nonProjTokens = state.queryInput
    .trim()
    .split(/\s+/)
    .filter((t: string) => {
      if (!t) {
        return false
      }
      if (t.startsWith("+")) {
        return false
      }
      if (t.startsWith("-") && !/[><!:]/.test(t.slice(1))) {
        return false
      }
      return true
    })
  const projStr = Object.keys(proj).length > 0 ? " " + projectionToSimple(proj) : ""
  dispatch({ type: "SET_QUERY_INPUT", input: (nonProjTokens.join(" ") + projStr).trim() })
  dispatch({ type: "SUBMIT_QUERY" })
}
