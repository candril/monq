/**
 * Toast — transient status message, bottom-right corner, auto-dismisses.
 *
 * Kinds:
 *   info    — primary blue  — clipboard copies, neutral info
 *   success — green         — applied, inserted, updated, deleted confirmations
 *   warning — orange        — already filtered, already in $match, no-ops
 *   error   — red           — parse errors, failed operations
 */

import { useEffect } from "react"
import { theme } from "../theme"

type ToastKind = "info" | "success" | "warning" | "error"

interface ToastProps {
  message: { text: string; kind: ToastKind } | null
  onDismiss: () => void
}

const DURATION: Record<ToastKind, number> = {
  info: 2500,
  success: 2500,
  warning: 3000,
  error: 4000,
}

const KIND_COLOR: Record<ToastKind, string> = {
  info: theme.primary,
  success: theme.success,
  warning: theme.warning,
  error: theme.error,
}

const KIND_ICON: Record<ToastKind, string> = {
  info: "●",
  success: "✓",
  warning: "!",
  error: "✗",
}

export function Toast({ message, onDismiss }: ToastProps) {
  useEffect(() => {
    if (!message) return
    const t = setTimeout(onDismiss, DURATION[message.kind])
    return () => clearTimeout(t)
  }, [message])

  if (!message) return null

  const color = KIND_COLOR[message.kind]
  const icon = KIND_ICON[message.kind]

  // Split into lines for multi-line support
  const lines = message.text.split("\n").filter(Boolean)

  return (
    <box
      position="absolute"
      bottom={1}
      right={2}
      backgroundColor={theme.headerBg}
      paddingX={2}
      paddingY={1}
      flexDirection="column"
      gap={0}
    >
      {lines.map((line, i) => (
        <box key={i} flexDirection="row" gap={1}>
          {i === 0 && (
            <text>
              <span fg={color}>{icon}</span>
            </text>
          )}
          {i > 0 && (
            <text>
              <span fg={theme.textMuted}> </span>
            </text>
          )}
          <text>
            <span fg={i === 0 ? theme.text : theme.textMuted}>{line}</span>
          </text>
        </box>
      ))}
    </box>
  )
}
