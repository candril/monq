/**
 * Error display.
 */

import { theme } from "../theme"

interface ErrorViewProps {
  message: string
}

export function ErrorView({ message }: ErrorViewProps) {
  return (
    <box flexGrow={1} justifyContent="center" alignItems="center" flexDirection="column">
      <text>
        <span fg={theme.error}>Error: {message}</span>
      </text>
      <box marginTop={1}>
        <text>
          <span fg={theme.textDim}>Press q to quit</span>
        </text>
      </box>
    </box>
  )
}
