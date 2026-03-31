import { ConfirmDialog } from "./ConfirmDialog"
import { theme } from "../theme"
import type { BulkQueryUpdateConfirmation } from "../types"

interface BulkQueryUpdateConfirmDialogProps {
  confirmation: BulkQueryUpdateConfirmation
  focusedIndex: number
  awaitingFinalConfirm?: boolean
}

function summarise(obj: object): string {
  const s = JSON.stringify(obj)
  return s.length > 60 ? s.slice(0, 57) + "…" : s
}

export function BulkQueryUpdateConfirmDialog({
  confirmation,
  focusedIndex,
  awaitingFinalConfirm,
}: BulkQueryUpdateConfirmDialogProps) {
  const { filter, update, upsert, matchedCount, collectionName } = confirmation

  if (awaitingFinalConfirm) {
    return (
      <ConfirmDialog
        title="Bulk Update — Final Confirmation"
        lines={[
          { text: `Empty filter — ALL ${matchedCount} documents in "${collectionName}" will be updated.`, danger: true },
          { text: `update  ${summarise(update)}`, dim: true },
          { text: "" },
          { text: "This cannot be undone.", danger: true },
        ]}
        options={[
          { key: "y", label: `yes, update ALL ${matchedCount}`, color: theme.error },
          { key: "c", label: "cancel", color: theme.textMuted },
        ]}
        focusedIndex={focusedIndex}
      />
    )
  }

  const lines = [
    { text: `filter  ${summarise(filter)}`, dim: true },
    { text: `update  ${summarise(update)}`, dim: true },
    { text: "" },
    {
      text:
        matchedCount === 0
          ? "No documents match the filter."
          : `${matchedCount} document${matchedCount === 1 ? "" : "s"} will be updated.`,
      danger: matchedCount === 0,
    },
  ]

  if (upsert) {
    lines.push({ text: "upsert: true — a new document will be inserted if no match.", dim: true })
  }

  const options = [
    { key: "a", label: "apply", color: theme.success },
    { key: "c", label: "cancel", color: theme.textMuted },
  ]

  return (
    <ConfirmDialog
      title="Bulk Update — Confirm"
      lines={lines}
      options={options}
      focusedIndex={focusedIndex}
    />
  )
}
