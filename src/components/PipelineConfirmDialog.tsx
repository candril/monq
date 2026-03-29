import { ConfirmDialog } from "./ConfirmDialog"
import { theme } from "../theme"
import type { Document } from "mongodb"

interface PipelineConfirmDialogProps {
  pipeline: Document[]
  simpleQuery: string
  focusedIndex: number
}

export function PipelineConfirmDialog({ pipeline, simpleQuery, focusedIndex }: PipelineConfirmDialogProps) {
  const hasComplex = pipeline.some(
    (s) => !["$match", "$sort", "$project"].includes(Object.keys(s)[0]),
  )
  return (
    <ConfirmDialog
      title="Switch to simple filter?"
      lines={[
        {
          text: hasComplex
            ? "Pipeline has complex stages that cannot be expressed in simple mode."
            : "Some filter conditions cannot be fully translated to simple mode.",
          dim: true,
        },
        { text: "" },
        {
          text: simpleQuery ? `Translated: ${simpleQuery}` : "(no translatable conditions)",
          dim: true,
        },
      ]}
      options={[
        { key: "n", label: "New tab (clean filter)", color: theme.primary },
        { key: "o", label: "Overwrite (use translated portion)", color: theme.warning },
        { key: "Esc", label: "Cancel", color: theme.textMuted },
      ]}
      focusedIndex={focusedIndex}
    />
  )
}
