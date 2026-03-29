import { ConfirmDialog } from "./ConfirmDialog"
import { theme } from "../theme"
import { docSummary } from "../utils/format"
import type { DeleteConfirmation } from "../types"

interface DeleteConfirmDialogProps {
  confirmation: DeleteConfirmation
  focusedIndex: number
}

export function DeleteConfirmDialog({ confirmation, focusedIndex }: DeleteConfirmDialogProps) {
  const { docs } = confirmation
  return (
    <ConfirmDialog
      title="Delete Documents"
      lines={[
        { text: `Delete ${docs.length} document${docs.length === 1 ? "" : "s"}?` },
        { text: "" },
        ...docs.map((doc) => ({
          text: `  ${docSummary(doc as Record<string, unknown>)}`,
          danger: true,
        })),
      ]}
      options={[
        { key: "c", label: "cancel", color: theme.textMuted },
        { key: "d", label: `delete ${docs.length}`, color: theme.error },
      ]}
      focusedIndex={focusedIndex}
    />
  )
}
