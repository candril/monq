/**
 * Document list — tabular display with auto-detected columns.
 * Presto-style: scrollbox, header row, subtle row highlight.
 */

import { useRef, useEffect, useMemo } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import type { Document } from "mongodb"
import type { DetectedColumn } from "../types"
import { theme } from "../theme"
import { formatValue, valueColor, detectValueType, padRight } from "../utils/format"

const SCROLL_MARGIN = 3
const MIN_COL_WIDTH = 6
const MAX_COL_WIDTH = 40

interface DocumentListProps {
  documents: Document[]
  columns: DetectedColumn[]
  selectedIndex: number
}

/** Calculate column widths based on content */
function computeColumnWidths(
  documents: Document[],
  columns: DetectedColumn[],
  totalWidth: number,
): Map<string, number> {
  const visible = columns.filter((c) => c.visible)
  if (visible.length === 0) return new Map()

  // Sample content widths
  const widths = new Map<string, number>()
  for (const col of visible) {
    // Start with header width
    let maxW = col.field.length

    // Sample first 50 docs for content width
    const sample = documents.slice(0, 50)
    for (const doc of sample) {
      const val = getNestedValue(doc, col.field)
      const formatted = formatValue(val, MAX_COL_WIDTH)
      maxW = Math.max(maxW, formatted.length)
    }

    widths.set(col.field, Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, maxW)))
  }

  // Distribute space to fill 100% width
  const padding = 2 // left + right padding
  const gaps = visible.length - 1 // spaces between columns
  const totalColWidth = [...widths.values()].reduce((a, b) => a + b, 0)
  const available = totalWidth - padding - gaps

  if (totalColWidth > available) {
    // Shrink proportionally
    const ratio = available / totalColWidth
    for (const [field, w] of widths) {
      widths.set(field, Math.max(MIN_COL_WIDTH, Math.floor(w * ratio)))
    }
  } else if (totalColWidth < available) {
    // Distribute extra space proportionally
    const extra = available - totalColWidth
    const entries = [...widths.entries()]
    let distributed = 0
    for (let i = 0; i < entries.length; i++) {
      const [field, w] = entries[i]
      const share = i === entries.length - 1
        ? extra - distributed // last column gets remainder
        : Math.floor(extra * (w / totalColWidth))
      widths.set(field, w + share)
      distributed += share
    }
  }

  return widths
}

/** Get a possibly nested value from a document */
function getNestedValue(doc: Document, field: string): unknown {
  const parts = field.split(".")
  let current: unknown = doc
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export function DocumentList({ documents, columns, selectedIndex }: DocumentListProps) {
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const { width: terminalWidth } = useTerminalDimensions()

  // Auto-scroll to keep selection visible
  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox) return

    const viewportHeight = scrollbox.viewport?.height ?? 20
    const scrollTop = scrollbox.scrollTop
    const scrollBottom = scrollTop + viewportHeight

    if (selectedIndex < scrollTop + SCROLL_MARGIN) {
      scrollbox.scrollTo(Math.max(0, selectedIndex - SCROLL_MARGIN))
    } else if (selectedIndex >= scrollBottom - SCROLL_MARGIN) {
      scrollbox.scrollTo(selectedIndex - viewportHeight + SCROLL_MARGIN + 1)
    }
  }, [selectedIndex])

  const visibleColumns = columns.filter((c) => c.visible)
  const colWidths = useMemo(
    () => computeColumnWidths(documents, columns, terminalWidth),
    [documents, columns, terminalWidth],
  )

  if (documents.length === 0) {
    return (
      <box flexGrow={1} justifyContent="center" alignItems="center">
        <text>
          <span fg={theme.textDim}>No documents found</span>
        </text>
      </box>
    )
  }

  return (
    <box flexGrow={1} flexDirection="column" overflow="hidden">
      <HeaderRow columns={visibleColumns} colWidths={colWidths} />
      <scrollbox ref={scrollRef} flexGrow={1}>
        {documents.map((doc, i) => (
          <DocumentRow
            key={String(doc._id ?? i)}
            doc={doc}
            columns={visibleColumns}
            colWidths={colWidths}
            selected={i === selectedIndex}
          />
        ))}
      </scrollbox>
    </box>
  )
}

function HeaderRow({
  columns,
  colWidths,
}: {
  columns: DetectedColumn[]
  colWidths: Map<string, number>
}) {
  return (
    <box height={1} width="100%" paddingLeft={1} paddingRight={1}>
      <text fg={theme.textMuted}>
        {columns.map((col, i) => {
          const w = colWidths.get(col.field) ?? MIN_COL_WIDTH
          const sep = i < columns.length - 1 ? " " : ""
          return padRight(col.field, w) + sep
        }).join("")}
      </text>
    </box>
  )
}

function DocumentRow({
  doc,
  columns,
  colWidths,
  selected,
}: {
  doc: Document
  columns: DetectedColumn[]
  colWidths: Map<string, number>
  selected: boolean
}) {
  return (
    <box
      height={1}
      width="100%"
      backgroundColor={selected ? theme.headerBg : undefined}
      paddingLeft={1}
      paddingRight={1}
    >
      <text>
        {columns.map((col, i) => {
          const w = colWidths.get(col.field) ?? MIN_COL_WIDTH
          const val = getNestedValue(doc, col.field)
          const formatted = padRight(formatValue(val, w), w)
          const type = detectValueType(val)
          const color = selected ? theme.text : valueColor(type)
          const sep = i < columns.length - 1 ? " " : ""
          return <><span fg={color}>{formatted}</span>{sep ? <span>{sep}</span> : null}</>
        })}
      </text>
    </box>
  )
}
