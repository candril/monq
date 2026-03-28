/**
 * Confirmation dialogs.
 * ConfirmDialog — badge-style selectable options with j/k navigation + Enter.
 * ConfirmChoiceDialog — simple key-choice list without navigation.
 */

import { theme } from "../theme"

export interface ConfirmOption {
  key: string
  label: string
  color?: string
}

export interface ConfirmLine {
  text: string
  dim?: boolean
  danger?: boolean
}

interface ConfirmDialogProps {
  title: string
  lines: ConfirmLine[]
  options: ConfirmOption[]
  focusedIndex: number
}

export function ConfirmDialog({ title, lines, options, focusedIndex }: ConfirmDialogProps) {
  return (
    <box position="absolute" top={0} left={0} width="100%" height="100%" zIndex={200} justifyContent="center" alignItems="center">
      <box position="absolute" top={0} left={0} width="100%" height="100%" backgroundColor={theme.overlayBg} />
      <box width={72} flexDirection="column" backgroundColor={theme.modalBg}>
        <box paddingX={2} paddingY={1} backgroundColor={theme.headerBg}>
          <text><span fg={theme.warning}>{title}</span></text>
        </box>
        <box flexDirection="column" paddingX={2} paddingY={1}>
          {lines.map((line, i) => (
            <text key={i}>
              <span fg={line.danger ? theme.error : line.dim ? theme.textDim : theme.text}>{line.text || " "}</span>
            </text>
          ))}
        </box>
        <box paddingX={2} paddingTop={1} paddingBottom={1} backgroundColor={theme.headerBg} flexDirection="column" gap={1}>
          <box flexDirection="row" gap={2}>
            {options.map((opt, i) => {
              const selected = i === focusedIndex
              const bg = selected ? (opt.color ?? theme.primary) : undefined
              const fg = selected ? theme.bg : theme.textDim
              return (
                <box key={opt.key} paddingLeft={1} paddingRight={1} backgroundColor={bg} flexShrink={0}>
                  <text fg={fg}>{opt.key}: {opt.label}</text>
                </box>
              )
            })}
          </box>
          <text>
            <span fg={theme.textMuted}>h/l navigate · </span>
            <span fg={theme.text}>Enter confirm</span>
          </text>
        </box>
      </box>
    </box>
  )
}

export interface ConfirmChoice {
  key: string
  label: string
  color?: string
}

interface ConfirmChoiceDialogProps {
  visible: boolean
  title: string
  message?: string
  choices: ConfirmChoice[]
}

export function ConfirmChoiceDialog({ visible, title, message, choices }: ConfirmChoiceDialogProps) {
  if (!visible) return null
  return (
    <box position="absolute" top={0} left={0} width="100%" height="100%" justifyContent="center" alignItems="center" backgroundColor={theme.overlayBg}>
      <box flexDirection="column" backgroundColor={theme.modalBg} paddingX={3} paddingY={1} minWidth={50}>
        <box height={1} justifyContent="center" marginBottom={1}>
          <text><span fg={theme.primary}><strong>{title}</strong></span></text>
        </box>
        {message && (
          <box marginBottom={1}>
            <text><span fg={theme.textDim}>{message}</span></text>
          </box>
        )}
        <box flexDirection="column" gap={0}>
          {choices.map((choice) => (
            <box key={choice.key} height={1} flexDirection="row" gap={1}>
              <text><span fg={choice.color ?? theme.warning}><strong>[{choice.key}]</strong></span></text>
              <text><span fg={theme.text}>{choice.label}</span></text>
            </box>
          ))}
        </box>
      </box>
    </box>
  )
}
