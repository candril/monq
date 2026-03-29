/**
 * PipelineBar — always-visible display of the active pipeline.
 * Shown when pipelineMode = true. Always expanded (one row per stage).
 * Tab → simple mode. Ctrl+F → edit in $EDITOR.
 */

import type { Document } from "mongodb"
import { theme } from "../theme"

interface PipelineBarProps {
  pipeline: Document[]
  isAggregate: boolean
  watching: boolean
}

export function PipelineBar({ pipeline, isAggregate, watching }: PipelineBarProps) {
  if (pipeline.length === 0) {
    // Pipeline mode but no stages yet (e.g. just switched, no filter)
    return (
      <box height={1} backgroundColor={theme.headerBg} paddingX={1} flexDirection="row" gap={1}>
        <box backgroundColor={theme.queryBson} paddingX={1}>
          <text>
            <span fg={theme.bg}>
              <strong>pipeline</strong>
            </span>
          </text>
        </box>
        <text>
          <span fg={theme.textMuted}>no stages — Ctrl+F to edit, Ctrl+E tmux split</span>
        </text>
      </box>
    )
  }

  const badge = isAggregate ? "aggregate" : "pipeline"
  const badgeBg = isAggregate ? theme.warning : theme.queryBson

  const stageRows = pipeline.map((stage, i) => {
    const [name, val] = Object.entries(stage)[0]
    let valueStr: string
    try {
      valueStr = JSON.stringify(val, null, 0)
    } catch {
      valueStr = "{}"
    }
    const truncated = valueStr.length > 80 ? valueStr.slice(0, 78) + "…}" : valueStr

    return (
      <box key={i} height={1} paddingLeft={2} flexDirection="row" gap={1}>
        <text>
          <span fg={theme.queryBson}>{name.padEnd(10)}</span>
        </text>
        <text>
          <span fg={theme.text}>{truncated}</span>
        </text>
      </box>
    )
  })

  return (
    <box height={1 + pipeline.length} backgroundColor={theme.headerBg} flexDirection="column">
      <box height={1} paddingX={1} flexDirection="row" gap={1}>
        <box backgroundColor={badgeBg} paddingX={1}>
          <text>
            <span fg={theme.bg}>
              <strong>
                {badge}
                {watching ? " ~" : ""}
              </strong>
            </span>
          </text>
        </box>
        <text>
          <span fg={theme.textMuted}>
            {pipeline.length} stage{pipeline.length !== 1 ? "s" : ""}
          </span>
        </text>
        <box flexGrow={1} />
        <text>
          <span fg={theme.textMuted}>Tab→simple Ctrl+F edit Ctrl+E split ⌫ clear</span>
        </text>
      </box>
      {stageRows}
    </box>
  )
}
