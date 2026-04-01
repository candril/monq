import { ConfirmDialog } from "./ConfirmDialog"
import { theme } from "../theme"
import type { IndexCreateConfirmation } from "../types"

interface IndexCreateConfirmDialogProps {
  confirmation: IndexCreateConfirmation
  focusedIndex: number
}

export function IndexCreateConfirmDialog({
  confirmation,
  focusedIndex,
}: IndexCreateConfirmDialogProps) {
  const { toCreate, toDrop, toReplace } = confirmation

  const lines = []

  // New indexes (not replacements)
  const newIndexes = toCreate.filter((def) => !toReplace.includes(def.name))
  if (newIndexes.length > 0) {
    lines.push({
      text: `${newIndexes.length} new index${newIndexes.length === 1 ? "" : "es"} to create:`,
      dim: true,
    })
    for (const def of newIndexes) {
      lines.push({ text: `  ${def.name}  ${JSON.stringify(def.key)}` })
    }
  }

  // Replacements (drop + recreate)
  if (toReplace.length > 0) {
    if (newIndexes.length > 0) lines.push({ text: "" })
    lines.push({
      text: `${toReplace.length} index${toReplace.length === 1 ? "" : "es"} to replace (drop + recreate):`,
      dim: true,
    })
    for (const name of toReplace) {
      const def = toCreate.find((d) => d.name === name)
      lines.push({
        text: `  ${name}  ${def ? JSON.stringify(def.key) : ""}`,
        dim: false,
        danger: true,
      } as import("./ConfirmDialog").ConfirmLine)
    }
  }

  // Drops (not replacements)
  const pureDrop = toDrop.filter((name) => !toReplace.includes(name))
  if (pureDrop.length > 0) {
    if (newIndexes.length > 0 || toReplace.length > 0) lines.push({ text: "" })
    lines.push({
      text: `${pureDrop.length} index${pureDrop.length === 1 ? "" : "es"} to drop:`,
      dim: true,
    })
    for (const name of pureDrop) {
      lines.push({
        text: `  ${name}`,
        dim: false,
        danger: true,
      } as import("./ConfirmDialog").ConfirmLine)
    }
  }

  const options = [
    { key: "c", label: "cancel", color: theme.textMuted },
    { key: "a", label: "apply", color: theme.success },
  ]

  return (
    <ConfirmDialog
      title="Manage Indexes — Confirm"
      lines={lines}
      options={options}
      focusedIndex={focusedIndex}
    />
  )
}
