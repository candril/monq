import { ConfirmDialog } from "./ConfirmDialog"
import { theme } from "../theme"
import type { ExportCancelConfirmation } from "../types"

interface ExportCancelDialogProps {
  confirmation: ExportCancelConfirmation
  focusedIndex: number
}

export function ExportCancelDialog({ confirmation, focusedIndex }: ExportCancelDialogProps) {
  return (
    <ConfirmDialog
      title="Cancel Export"
      lines={[
        {
          text: `An ${confirmation.format.toUpperCase()} export is in progress.`,
        },
        { text: "Cancel the export? The partial file will be deleted.", dim: true },
      ]}
      options={[
        { key: "k", label: "keep exporting", color: theme.textMuted },
        { key: "c", label: "cancel export", color: theme.error },
      ]}
      focusedIndex={focusedIndex}
    />
  )
}
