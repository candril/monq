import { theme } from "../theme"
import { Spinner } from "./Loading"
import type { SelectionMode } from "../types"

interface HeaderProps {
  dbName: string
  host: string
  /** Collection name — shown when only one tab is open */
  collectionName?: string
  /** Whether data is being loaded/refreshed */
  loading?: boolean
  /** Right side content (e.g., document count) */
  right?: string
  selectionMode?: SelectionMode
  selectionCount?: number
}

export function Header({
  dbName,
  host,
  collectionName,
  loading,
  right,
  selectionMode,
  selectionCount,
}: HeaderProps) {
  const hasSelection =
    selectionMode !== "none" &&
    selectionMode !== undefined &&
    selectionCount !== undefined &&
    selectionCount > 0
  const isSelecting = selectionMode === "selecting"

  return (
    <box height={1} backgroundColor={theme.headerBg} paddingX={1} flexDirection="row">
      {/* Left side: App name + collection/db/host (collection most visible) */}
      <text>
        <span fg={theme.textMuted}>Monq</span>
        {collectionName && (
          <span fg={theme.text}>
            {" "}
            <strong>{collectionName}</strong>
          </span>
        )}
        <span fg={theme.textDim}> {dbName}</span>
        <span fg={theme.textMuted}>@{host}</span>
      </text>

      <box flexGrow={1} />

      {hasSelection && (
        <box marginRight={1}>
          <text>
            <span fg={isSelecting ? theme.warning : theme.textDim}>
              {isSelecting ? "SELECT" : "selected"}
            </span>
            <span fg={theme.warning}> {selectionCount}</span>
          </text>
        </box>
      )}

      {loading && (
        <box marginRight={1}>
          <Spinner />
        </box>
      )}

      {right && (
        <text>
          <span fg={theme.textDim}>{right}</span>
        </text>
      )}
    </box>
  )
}
