import { ConfirmDialog } from "./ConfirmDialog"
import { theme } from "../theme"
import { docSummary } from "../utils/format"
import type { BulkEditConfirmation } from "../types"

interface BulkEditConfirmDialogProps {
  confirmation: BulkEditConfirmation
  focusedIndex: number
}

export function BulkEditConfirmDialog({ confirmation, focusedIndex }: BulkEditConfirmDialogProps) {
  const { missing, added } = confirmation
  const missingCount = missing.length
  const addedCount = added.length

  const lines = []
  if (missingCount > 0) {
    lines.push({
      text: `${missingCount} doc${missingCount === 1 ? "" : "s"} removed from array:`,
      dim: true,
    })
    for (const doc of missing) {
      lines.push({ text: `  ${docSummary(doc as Record<string, unknown>)}`, danger: true })
    }
  }
  if (addedCount > 0) {
    if (missingCount > 0) {
      lines.push({ text: "" })
    }
    lines.push({
      text: `${addedCount} new doc${addedCount === 1 ? "" : "s"} added to array:`,
      dim: true,
    })
    for (const doc of added) {
      lines.push({ text: `  ${docSummary(doc as Record<string, unknown>)}` })
    }
  }

  const options = [
    { key: "b", label: "back to editor", color: theme.primary },
    { key: "i", label: "skip side effects", color: theme.secondary },
  ]
  if (missingCount > 0) {
    options.push({ key: "d", label: `delete ${missingCount}`, color: theme.error })
  }
  if (addedCount > 0) {
    options.push({ key: "a", label: `insert ${addedCount}`, color: theme.success })
  }
  if (missingCount > 0 && addedCount > 0) {
    options.push({ key: "x", label: "both", color: theme.error })
  }
  options.push({ key: "c", label: "cancel", color: theme.textMuted })

  return (
    <ConfirmDialog
      title="Bulk Edit — Side Effects"
      lines={lines}
      options={options}
      focusedIndex={focusedIndex}
    />
  )
}
