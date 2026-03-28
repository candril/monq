/**
 * PipelineBar — readonly display of the active pipeline or simple filter preview.
 * badge: [pipeline] or [aggregate]
 * Tab to switch back to simple, Ctrl+F to edit.
 */

import type { Document } from "mongodb"
import { theme } from "../theme"

interface PipelineBarProps {
  pipeline: Document[]
  previewPipeline: Document[]
  visible: boolean
  isAggregate: boolean
}

function stagePreview(value: unknown): string {
  try {
    const s = JSON.stringify(value)
    return s.length > 30 ? s.slice(0, 28) + "…}" : s
  } catch {
    return "{…}"
  }
}

export function PipelineBar({ pipeline, previewPipeline, visible, isAggregate }: PipelineBarProps) {
  const stages = pipeline.length > 0 ? pipeline : previewPipeline
  if (stages.length === 0) return null

  const badge = isAggregate ? "[aggregate]" : "[pipeline]"
  const badgeFg = isAggregate ? theme.warning : theme.queryBson

  if (!visible) {
    const summary = stages
      .slice(0, 3)
      .map((stage) => {
        const [name, val] = Object.entries(stage)[0]
        return `${name}:${stagePreview(val)}`
      })
      .join("  ")
    const more = stages.length > 3 ? `  +${stages.length - 3} more` : ""

    return (
      <box height={1} backgroundColor={theme.headerBg} paddingX={1} flexDirection="row" gap={1}>
        <text><span fg={badgeFg}>{badge}</span></text>
        <text><span fg={theme.text}>{summary}{more}</span></text>
        <box flexGrow={1} />
        <text><span fg={theme.textMuted}>F expand  Ctrl+F edit</span></text>
      </box>
    )
  }

  const stageRows = stages.map((stage, i) => {
    const [name, val] = Object.entries(stage)[0]
    let valueStr: string
    try { valueStr = JSON.stringify(val, null, 0) } catch { valueStr = "{}" }
    const truncated = valueStr.length > 80 ? valueStr.slice(0, 78) + "…}" : valueStr

    return (
      <box key={i} height={1} paddingLeft={2} flexDirection="row" gap={1}>
        <text><span fg={theme.queryBson}>{name.padEnd(10)}</span></text>
        <text><span fg={theme.text}>{truncated}</span></text>
      </box>
    )
  })

  return (
    <box height={1 + stages.length} backgroundColor={theme.headerBg} flexDirection="column">
      <box height={1} paddingX={1} flexDirection="row" gap={1}>
        <text><span fg={badgeFg}>{badge}</span></text>
        <text><span fg={theme.textMuted}>{stages.length} stage{stages.length !== 1 ? "s" : ""}</span></text>
        <box flexGrow={1} />
        <text><span fg={theme.textMuted}>Tab→simple  F hide  Ctrl+F edit</span></text>
      </box>
      {stageRows}
    </box>
  )
}
