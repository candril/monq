/**
 * Document view — placeholder until spec 003 is implemented.
 */

import { theme } from "../theme"

interface DocumentViewProps {
  collectionName: string
  documentCount: number
  loading: boolean
}

export function DocumentView({ collectionName, documentCount, loading }: DocumentViewProps) {
  if (loading) {
    return (
      <box flexGrow={1} justifyContent="center" alignItems="center">
        <text>
          <span fg={theme.textDim}>Loading {collectionName}...</span>
        </text>
      </box>
    )
  }

  return (
    <box flexGrow={1} justifyContent="center" alignItems="center">
      <text>
        <span fg={theme.textDim}>
          {collectionName} — {documentCount.toLocaleString()} documents
        </span>
      </text>
    </box>
  )
}
