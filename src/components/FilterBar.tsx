import type { QueryMode } from "../types"
import { theme } from "../theme"

interface FilterBarProps {
  /** Current query string */
  query: string
  /** Current query mode */
  mode: QueryMode
  /** Whether the query input is currently active/focused */
  editing?: boolean
  /** Called when input changes (only when editing) */
  onChange?: (value: string) => void
}

export function FilterBar({ query, mode, editing }: FilterBarProps) {
  // Only show when there's a query or actively editing
  if (!query && !editing) return null

  const modeLabel = mode === "simple" ? "Simple" : "BSON"
  const modeColor = mode === "simple" ? theme.querySimple : theme.queryBson

  return (
    <box height={1} backgroundColor={theme.headerBg} paddingX={1} flexDirection="row">
      {/* Mode indicator */}
      <text>
        <span fg={modeColor}>[{modeLabel}]</span>
      </text>

      {/* Query content */}
      <box marginLeft={1}>
        <text>
          <span fg={theme.primary}>/</span>
          <span fg={theme.text}>{query}</span>
          {editing && <span fg={theme.primary}>_</span>}
        </text>
      </box>

      <box flexGrow={1} />
    </box>
  )
}
