/**
 * Confirmation dialog — badge-style selectable options with j/k navigation + Enter.
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
    <box
      position="absolute"
      top={0}
      left={0}
      width="100%"
      height="100%"
      zIndex={200}
      justifyContent="center"
      alignItems="center"
    >
      <box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        backgroundColor={theme.overlayBg}
      />
      <box minWidth={72} maxWidth="90%" flexDirection="column" backgroundColor={theme.modalBg}>
        <box paddingX={2} paddingY={1} backgroundColor={theme.headerBg}>
          <text>
            <span fg={theme.warning}>{title}</span>
          </text>
        </box>
        <box flexDirection="column" paddingX={2} paddingY={1}>
          {lines.map((line, i) => (
            <text key={i}>
              <span fg={line.danger ? theme.error : line.dim ? theme.textDim : theme.text}>
                {line.text || " "}
              </span>
            </text>
          ))}
        </box>
        <box
          paddingX={2}
          paddingTop={1}
          paddingBottom={1}
          backgroundColor={theme.headerBg}
          flexDirection="column"
          gap={1}
        >
          <box flexDirection="row" gap={4} flexWrap="wrap">
            {options.map((opt, i) => {
              const selected = i === focusedIndex
              const bg = selected ? (opt.color ?? theme.primary) : undefined
              const fg = selected ? theme.bg : theme.textDim
              return (
                <box
                  key={opt.key}
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={bg}
                  flexShrink={0}
                >
                  <text fg={fg}>
                    {opt.key}: {opt.label}
                  </text>
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


