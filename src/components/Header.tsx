import { theme } from "../theme"
import { Spinner } from "./Loading"

interface HeaderProps {
  dbName: string
  host: string
  /** Collection name — shown when only one tab is open */
  collectionName?: string
  /** Whether data is being loaded/refreshed */
  loading?: boolean
  /** Right side content (e.g., document count) */
  right?: string
}

export function Header({ dbName, host, collectionName, loading, right }: HeaderProps) {
  return (
    <box height={1} backgroundColor={theme.headerBg} paddingX={1} flexDirection="row">
      {/* Left side: App name + collection/db/host (collection most visible) */}
      <text>
        <span fg={theme.textMuted}>Mon-Q</span>
        {collectionName && (
          <span fg={theme.text}>{" "}<strong>{collectionName}</strong></span>
        )}
        <span fg={theme.textDim}>{" "}{dbName}</span>
        <span fg={theme.textMuted}>@{host}</span>
      </text>

      <box flexGrow={1} />

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
