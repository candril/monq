/**
 * Pure pipeline query utilities — classification and find()-part extraction.
 */

import type { Document } from "mongodb"

// Stages that can be expressed as find(filter, { sort, projection })
const FIND_COMPATIBLE_STAGES = new Set(["$match", "$sort", "$project"])

/** Typed pipeline stage — a Document with a single known operator key */
type PipelineStage = { [K in string]: Document }

/** Cast a Document to a typed pipeline stage for safe property access */
export function stageOf(stage: Document): PipelineStage {
  return stage as PipelineStage
}

/** Returns true if the pipeline requires aggregate() rather than find() */
export function classifyPipeline(pipeline: Document[]): boolean {
  if (pipeline.length === 0) {
    return false
  }
  return pipeline.some((stage) => !FIND_COMPATIBLE_STAGES.has(Object.keys(stage)[0]))
}

/** Extract find()-compatible parts ($match, $sort, $project) from a pipeline */
export function extractFindParts(pipeline: Document[]): {
  filter: Document
  sort?: Document
  projection?: Document
} {
  const matchStage = pipeline.find((s) => "$match" in s)
  const sortStage = pipeline.find((s) => "$sort" in s)
  const projectStage = pipeline.find((s) => "$project" in s)
  const filter = matchStage ? (stageOf(matchStage).$match ?? {}) : {}
  const sort = sortStage ? stageOf(sortStage).$sort : undefined
  const projection = projectStage ? stageOf(projectStage).$project : undefined
  return { filter, sort, projection }
}
