/**
 * Document list — tabular display with auto-detected columns.
 * Presto-style: scrollbox, header row, subtle row highlight.
 * h/l moves column selection, j/k moves row selection.
 */

import { useRef, useEffect, useMemo } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import type { Document } from "mongodb"
import type { DetectedColumn } from "../types"
import { theme } from "../theme"
import { formatValue, valueColor, detectValueType, padRight, truncate } from "../utils/format"

const SCROLL_MARGIN = 3
const MIN_COL_WIDTH = 6
const MAX_COL_WIDTH = 40
const MINIMIZED_COL_WIDTH = 3

interface DocumentListProps {
  documents: Document[]
  columns: DetectedColumn[]
  selectedIndex: number
  selectedColumnIndex: number
}

/** Calculate column widths based on content and display mode */
function computeColumnWidths(
  documents: Document[],
  columns: DetectedColumn[],
  totalWidth: number,
): Map<string, number> {
  const visible = columns.filter((c) => c.visible)
  if (visible.length === 0) return new Map()

  const widths = new Map<string, number>()
  const sample = documents.slice(0, 50)

  // First pass: compute natural width per column
  for (const col of visible) {
    if (col.displayMode === "minimized") {
      widths.set(col.field, MINIMIZED_COL_WIDTH)
      continue
    }

    // Measure content width
    let maxW = col.field.length
    for (const doc of sample) {
      const val = getNestedValue(doc, col.field)
      // Full mode: no max cap; normal mode: cap at MAX_COL_WIDTH
      const cap = col.displayMode === "full" ? 200 : MAX_COL_WIDTH
      const formatted = formatValue(val, cap)
      maxW = Math.max(maxW, formatted.length)
    }

    if (col.displayMode === "full") {
      widths.set(col.field, Math.max(MIN_COL_WIDTH, maxW))
    } else {
      widths.set(col.field, Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, maxW)))
    }
  }

  // Second pass: distribute remaining space among "normal" columns
  const padding = 2
  const gaps = visible.length - 1
  const totalColWidth = [...widths.values()].reduce((a, b) => a + b, 0)
  const available = totalWidth - padding - gaps

  // Only resize "normal" columns — full and minimized keep their width
  const normalCols = visible.filter((c) => c.displayMode === "normal")
  const fixedWidth = visible
    .filter((c) => c.displayMode !== "normal")
    .reduce((sum, c) => sum + (widths.get(c.field) ?? 0), 0)
  const normalTotal = normalCols.reduce((sum, c) => sum + (widths.get(c.field) ?? 0), 0)
  const availableForNormal = available - fixedWidth

  if (normalCols.length > 0 && normalTotal > 0) {
    if (normalTotal > availableForNormal) {
      // Shrink normal columns proportionally
      const ratio = availableForNormal / normalTotal
      for (const col of normalCols) {
        const w = widths.get(col.field) ?? MIN_COL_WIDTH
        widths.set(col.field, Math.max(MIN_COL_WIDTH, Math.floor(w * ratio)))
      }
    } else if (normalTotal < availableForNormal) {
      // Distribute extra space among normal columns
      const extra = availableForNormal - normalTotal
      let distributed = 0
      for (let i = 0; i < normalCols.length; i++) {
        const col = normalCols[i]
        const w = widths.get(col.field) ?? MIN_COL_WIDTH
        const share = i === normalCols.length - 1
          ? extra - distributed
          : Math.floor(extra * (w / normalTotal))
        widths.set(col.field, w + share)
        distributed += share
      }
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

export function DocumentList({ documents, columns, selectedIndex, selectedColumnIndex }: DocumentListProps) {
  const scrollRef = useRef<ScrollBoxRenderable>(null)
  const { width: terminalWidth } = useTerminalDimensions()

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
      <HeaderRow columns={visibleColumns} colWidths={colWidths} selectedColumnIndex={selectedColumnIndex} />
      <scrollbox ref={scrollRef} flexGrow={1}>
        {documents.map((doc, i) => (
          <DocumentRow
            key={String(doc._id ?? i)}
            doc={doc}
            columns={visibleColumns}
            colWidths={colWidths}
            selected={i === selectedIndex}
            selectedColumnIndex={selectedColumnIndex}
          />
        ))}
      </scrollbox>
    </box>
  )
}

function HeaderRow({
  columns,
  colWidths,
  selectedColumnIndex,
}: {
  columns: DetectedColumn[]
  colWidths: Map<string, number>
  selectedColumnIndex: number
}) {
  return (
    <box height={1} width="100%" paddingLeft={1} paddingRight={1}>
      <text>
        {columns.map((col, i) => {
          const w = colWidths.get(col.field) ?? MIN_COL_WIDTH
          const isSelectedCol = i === selectedColumnIndex
          const label = col.displayMode === "minimized"
            ? truncate(col.field, MINIMIZED_COL_WIDTH)
            : col.field
          const color = isSelectedCol
            ? theme.primary
            : col.displayMode === "minimized" ? theme.textMuted : theme.textDim
          const sep = i < columns.length - 1 ? " " : ""
          return <><span fg={color}>{padRight(label, w)}</span>{sep ? <span>{sep}</span> : null}</>
        })}
      </text>
    </box>
  )
}

function DocumentRow({
  doc,
  columns,
  colWidths,
  selected,
  selectedColumnIndex,
}: {
  doc: Document
  columns: DetectedColumn[]
  colWidths: Map<string, number>
  selected: boolean
  selectedColumnIndex: number
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
          const isActiveCell = selected && i === selectedColumnIndex
          const color = isActiveCell ? theme.primary : selected ? theme.text : valueColor(type)
          const sep = i < columns.length - 1 ? " " : ""
          return <><span fg={color}>{formatted}</span>{sep ? <span>{sep}</span> : null}</>
        })}
      </text>
    </box>
  )
}
