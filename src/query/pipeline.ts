/**
 * Pure pipeline query utilities — classification and find()-part extraction.
 */

import type { Document } from "mongodb"

// Stages that can be expressed as find(filter, { sort, projection })
const FIND_COMPATIBLE_STAGES = new Set(["$match", "$sort", "$project"])

/** Returns true if the pipeline requires aggregate() rather than find() */
export function classifyPipeline(pipeline: Document[]): boolean {
  if (pipeline.length === 0) return false
  return pipeline.some((stage) => !FIND_COMPATIBLE_STAGES.has(Object.keys(stage)[0]))
}

/** Extract find()-compatible parts ($match, $sort, $project) from a pipeline */
export function extractFindParts(pipeline: Document[]): {
  filter: Document
  sort?: Document
  projection?: Document
} {
  const filter = (pipeline.find((s) => "$match" in s) as Record<string, Document>)?.$match ?? {}
  const sort = (pipeline.find((s) => "$sort" in s) as Record<string, Document>)?.$sort
  const projection = (pipeline.find((s) => "$project" in s) as Record<string, Document>)?.$project
  return { filter, sort, projection }
}
