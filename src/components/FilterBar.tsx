/**
 * Filter bar — shows at the bottom.
 * When editing: focused <input> handles all text input natively (Ctrl+W, cursor, etc.)
 * When not editing: shows the active query as static text.
 */

import { theme } from "../theme"

interface FilterBarProps {
  /** Current query string */
  query: string
  /** Whether the query input is currently active/focused */
  editing?: boolean
  /** Called when input changes (only when editing) */
  onChange?: (value: string) => void
  /** Called when Enter is pressed */
  onSubmit?: () => void
}

export function FilterBar({ query, editing, onChange, onSubmit }: FilterBarProps) {
  if (!query && !editing) return null

  return (
    <box height={1} backgroundColor={theme.headerBg} paddingX={1} flexDirection="row">
      <text fg={theme.textMuted}>/</text>
      {editing ? (
        <input
          value={query}
          onInput={onChange}
          onChange={onSubmit}
          placeholder="filter..."
          focused={true}
          flexGrow={1}
          backgroundColor={theme.headerBg}
          textColor={theme.text}
          placeholderColor={theme.textDim}
        />
      ) : (
        <text>
          <span fg={theme.text}>{query}</span>
        </text>
      )}
    </box>
  )
}
