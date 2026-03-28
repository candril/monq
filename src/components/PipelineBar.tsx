/**
 * PipelineBar — readonly display of the active aggregation pipeline.
 *
 * Collapsed (1 row):
 *   [pipeline] $match:{…}  $sort:{…}  $project:{…}   Ctrl+F edit  F hide
 *
 * Expanded (one row per stage):
 *   [pipeline]  Ctrl+F edit  F collapse  ⌫ clear
 *   $match    { FamilyName: "stefan" }
 *   $sort     { FamilyName: 1 }
 *
 * Shown only when pipeline is non-empty.
 */

import type { Document } from "mongodb"
import { theme } from "../theme"

interface PipelineBarProps {
  pipeline: Document[]
  previewPipeline: Document[]
  visible: boolean
  isAggregate: boolean
}

/** Compact single-line summary of a stage value */
function stagePreview(value: unknown): string {
  try {
    const s = JSON.stringify(value)
    return s.length > 30 ? s.slice(0, 28) + "…}" : s
  } catch {
    return "{…}"
  }
}

export function PipelineBar({ pipeline, previewPipeline, visible, isAggregate }: PipelineBarProps) {
  // If no real pipeline but preview (from simple filter), use that for display
  const isPreview = pipeline.length === 0 && previewPipeline.length > 0
  const displayPipeline = pipeline.length > 0 ? pipeline : previewPipeline

  if (displayPipeline.length === 0) return null
  if (!visible) {
    // Collapsed 1-row summary
    const badge = isPreview ? "[simple]" : (isAggregate ? "[aggregate]" : "[pipeline]")
    const badgeFg = isPreview ? theme.querySimple : (isAggregate ? theme.warning : theme.queryBson)

  const badge = isAggregate ? "[aggregate]" : "[pipeline]"
  const badgeFg = isAggregate ? theme.warning : theme.queryBson

  if (!visible) {
    // Collapsed: single row with stage summaries
    const summary = pipeline
      .slice(0, 3)
      .map((stage) => {
        const [name, val] = Object.entries(stage)[0]
        return `${name}:${stagePreview(val)}`
      })
      .join("  ")
    const more = pipeline.length > 3 ? `  +${pipeline.length - 3} more` : ""

    return (
      <box height={1} backgroundColor={theme.headerBg} paddingX={1} flexDirection="row" gap={1}>
        <text><span fg={badgeFg}>{badge}</span></text>
        <text><span fg={theme.text}>{summary}{more}</span></text>
        <box flexGrow={1} />
        <text><span fg={theme.textMuted}>Ctrl+F edit  F expand  / simple  ⌫ clear</span></text>
      </box>
    )
  }

  // Expanded: header + one row per stage
  const stageRows = pipeline.map((stage, i) => {
    const [name, val] = Object.entries(stage)[0]
    let valueStr: string
    try {
      valueStr = JSON.stringify(val, null, 0)
    } catch {
      valueStr = "{}"
    }
    // Truncate long values to terminal width approximation
    const truncated = valueStr.length > 80 ? valueStr.slice(0, 78) + "…}" : valueStr

    return (
      <box key={i} height={1} paddingLeft={2} flexDirection="row" gap={1}>
        <text><span fg={theme.queryBson}>{name.padEnd(10)}</span></text>
        <text><span fg={theme.text}>{truncated}</span></text>
      </box>
    )
  })

  return (
    <box
      height={1 + pipeline.length}
      backgroundColor={theme.headerBg}
      flexDirection="column"
    >
      {/* Header */}
      <box height={1} paddingX={1} flexDirection="row" gap={1}>
        <text><span fg={badgeFg}>{badge}</span></text>
        <text><span fg={theme.textMuted}>{pipeline.length} stage{pipeline.length !== 1 ? "s" : ""}</span></text>
        <box flexGrow={1} />
        <text><span fg={theme.textMuted}>Ctrl+F edit  F collapse  ⌫ clear</span></text>
      </box>
      {stageRows}
    </box>
  )
}
