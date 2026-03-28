/**
 * Confirmation dialog — modal overlay for destructive/ambiguous actions.
 *
 * Renders centered over the screen with a title, optional message,
 * and a row of labeled key choices. The caller handles the keyboard
 * responses via useKeyboard — this component is purely display.
 *
 * Design matches the jj multiselection pattern: dark modal bg,
 * bordered box, color-coded key badges.
 *
 * Usage:
 *   <ConfirmDialog
 *     visible={state.confirmVisible}
 *     title="Switch to simple filter?"
 *     message="The $regex condition cannot be expressed in simple mode."
 *     choices={[
 *       { key: "s", label: "Switch (drop complex conditions)" },
 *       { key: "n", label: "Open in new tab" },
 *       { key: "Esc", label: "Cancel" },
 *     ]}
 *   />
 *
 * Key handling: wire in useKeyboardNav — when confirmVisible, intercept
 * the choice keys and dispatch the appropriate action.
 */

import { theme } from "../theme"

export interface ConfirmChoice {
  key: string
  label: string
  /** Color for the key badge — defaults to theme.primary */
  color?: string
}

interface ConfirmDialogProps {
  visible: boolean
  title: string
  message?: string
  choices: ConfirmChoice[]
}

export function ConfirmDialog({ visible, title, message, choices }: ConfirmDialogProps) {
  if (!visible) return null

  return (
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
      backgroundColor={theme.overlayBg}
    >
      <box
        flexDirection="column"
        backgroundColor={theme.modalBg}
        border={true}
        borderStyle="rounded"
        borderColor={theme.border}
        paddingX={3}
        paddingY={1}
        minWidth={50}
      >
        {/* Title */}
        <box height={1} justifyContent="center" marginBottom={1}>
          <text>
            <span fg={theme.primary}><strong>{title}</strong></span>
          </text>
        </box>

        {/* Optional message */}
        {message && (
          <box marginBottom={1}>
            <text>
              <span fg={theme.textDim}>{message}</span>
            </text>
          </box>
        )}

        {/* Choice rows */}
        <box flexDirection="column" gap={0}>
          {choices.map((choice) => (
            <box key={choice.key} height={1} flexDirection="row" gap={1}>
              <text>
                <span fg={choice.color ?? theme.warning}>
                  <strong>[{choice.key}]</strong>
                </span>
              </text>
              <text>
                <span fg={theme.text}>{choice.label}</span>
              </text>
            </box>
          ))}
        </box>
      </box>
    </box>
  )
}
