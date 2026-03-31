import { ConfirmDialog } from "./ConfirmDialog"
import { theme } from "../theme"
import type { BulkQueryDeleteConfirmation } from "../types"

interface BulkQueryDeleteConfirmDialogProps {
  confirmation: BulkQueryDeleteConfirmation
  focusedIndex: number
  awaitingFinalConfirm?: boolean
}

function summarise(obj: object): string {
  const s = JSON.stringify(obj)
  return s.length > 60 ? s.slice(0, 57) + "…" : s
}

export function BulkQueryDeleteConfirmDialog({
  confirmation,
  focusedIndex,
  awaitingFinalConfirm,
}: BulkQueryDeleteConfirmDialogProps) {
  const { filter, matchedCount, collectionName } = confirmation

  if (awaitingFinalConfirm) {
    return (
      <ConfirmDialog
        title="Bulk Delete — Final Confirmation"
        lines={[
          { text: `Empty filter — ALL ${matchedCount} documents in "${collectionName}" will be deleted.`, danger: true },
          { text: "" },
          { text: "This cannot be undone.", danger: true },
        ]}
        options={[
          { key: "y", label: `yes, delete ALL ${matchedCount}`, color: theme.error },
          { key: "c", label: "cancel", color: theme.textMuted },
        ]}
        focusedIndex={focusedIndex}
      />
    )
  }

  const lines = [
    { text: `filter  ${summarise(filter)}`, dim: true },
    { text: "" },
    {
      text:
        matchedCount === 0
          ? "No documents match the filter."
          : `${matchedCount} document${matchedCount === 1 ? "" : "s"} will be PERMANENTLY DELETED.`,
      danger: matchedCount > 0,
    },
  ]

  const options = [
    { key: "d", label: `delete ${matchedCount}`, color: theme.error },
    { key: "c", label: "cancel", color: theme.textMuted },
  ]

  return (
    <ConfirmDialog
      title="Bulk Delete — Confirm"
      lines={lines}
      options={options}
      focusedIndex={focusedIndex}
    />
  )
}
