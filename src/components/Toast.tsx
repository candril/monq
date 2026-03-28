/**
 * Toast — transient status message, auto-dismisses after 2.5s.
 */

import { useEffect } from "react"
import { theme } from "../theme"

interface ToastProps {
  message: string | null
  onDismiss: () => void
}

export function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDismiss, 2500)
    return () => clearTimeout(t)
  }, [message])

  if (!message) return null

  return (
    <box
      position="absolute"
      bottom={1}
      left={0}
      width="100%"
      height={1}
      backgroundColor={theme.headerBg}
      paddingX={2}
    >
      <text><span fg={theme.warning}>{message}</span></text>
    </box>
  )
}
