import { ConfirmDialog } from "./ConfirmDialog"
import { theme } from "../theme"
import type { BulkQueryUpdateConfirmation } from "../types"

interface BulkQueryUpdateConfirmDialogProps {
  confirmation: BulkQueryUpdateConfirmation
  focusedIndex: number
}

function summarise(obj: object): string {
  const s = JSON.stringify(obj)
  return s.length > 60 ? s.slice(0, 57) + "…" : s
}

export function BulkQueryUpdateConfirmDialog({
  confirmation,
  focusedIndex,
}: BulkQueryUpdateConfirmDialogProps) {
  const { filter, update, upsert, matchedCount } = confirmation

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
