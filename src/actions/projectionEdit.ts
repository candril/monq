/**
 * Read and write the active tab's projection, wherever it lives: the `+`/`-`
 * tokens of a simple query or the `$project` stage of a pipeline. Shared by
 * the `-` key and the column picker (spec 068).
 */

import type { Dispatch } from "react"
import type { Document } from "mongodb"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { parseSimpleQueryFull } from "../query/parser"
import { classifyPipeline, stageOf } from "../query/pipeline"
import { replaceProjectionTokens, type Projection } from "../query/projection"
import { serializePipelineSource } from "../utils/document"

/** Where the projection can be edited, or null in BSON mode (its own textarea). */
export function projectionTarget(state: AppState): "simple" | "pipeline" | null {
  if (state.pipelineMode) {
    return "pipeline"
  }
  return state.queryMode === "bson" ? null : "simple"
}

export function currentProjection(state: AppState): Projection | undefined {
  if (projectionTarget(state) === "pipeline") {
    const index = state.pipeline.findIndex((s) => "$project" in s)
    return index === -1 ? undefined : { ...(stageOf(state.pipeline[index]).$project as Projection) }
  }
  return parseSimpleQueryFull(state.queryInput).projection
}

/** Replace the projection and re-run the query. An empty projection removes it. */
export function applyProjection(
  state: AppState,
  dispatch: Dispatch<AppAction>,
  projection: Projection,
): void {
  if (projectionTarget(state) === "pipeline") {
    applyPipelineProjection(state, dispatch, projection)
    return
  }
  dispatch({
    type: "SET_QUERY_INPUT",
    input: replaceProjectionTokens(state.queryInput, projection),
  })
  dispatch({ type: "SUBMIT_QUERY" })
}

function applyPipelineProjection(
  state: AppState,
  dispatch: Dispatch<AppAction>,
  projection: Projection,
): void {
  const index = state.pipeline.findIndex((s) => "$project" in s)
  const empty = Object.keys(projection).length === 0
  let pipeline: Document[]
  if (empty) {
    pipeline = state.pipeline.filter((_, i) => i !== index)
  } else if (index !== -1) {
    pipeline = state.pipeline.map((s, i) => (i === index ? { $project: projection } : s))
  } else {
    pipeline = [...state.pipeline, { $project: projection }]
  }
  dispatch({
    type: "SET_PIPELINE",
    pipeline,
    source: serializePipelineSource(pipeline),
    isAggregate: classifyPipeline(pipeline),
  })
}
