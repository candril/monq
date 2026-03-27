import { theme } from "../theme"
import { Spinner } from "./Loading"

interface HeaderProps {
  dbName: string
  host: string
  /** Whether data is being loaded/refreshed */
  loading?: boolean
  /** Right side content (e.g., document count) */
  right?: string
}

export function Header({ dbName, host, loading, right }: HeaderProps) {
  return (
    <box height={1} backgroundColor={theme.headerBg} paddingX={1} flexDirection="row">
      {/* Left side: App name + connection */}
      <text>
        <span fg={theme.primary}>
          <strong>Mon-Q</strong>
        </span>
        <span fg={theme.textDim}>{" "}{dbName}</span>
        <span fg={theme.textMuted}>@{host}</span>
      </text>

      {/* Spacer */}
      <box flexGrow={1} />

      {/* Loading spinner */}
      {loading && (
        <box marginRight={1}>
          <Spinner />
        </box>
      )}

      {/* Right side info */}
      {right && (
        <text>
          <span fg={theme.textDim}>{right}</span>
        </text>
      )}
    </box>
  )
}
