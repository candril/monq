import { theme } from "../theme"

interface LoadingProps {
  message?: string
}

export function Loading({ message = "Loading..." }: LoadingProps) {
  return (
    <box flexGrow={1} justifyContent="center" alignItems="center">
      <text>
        <span fg={theme.textDim}>{message}</span>
      </text>
    </box>
  )
}
