/**
 * Document list — tabular display with auto-detected columns.
 * Supports horizontal scrolling when columns exceed terminal width.
 * h/l moves column cursor, j/k moves row cursor, w cycles column width mode.
 */

import { useRef, useEffect, useMemo } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import type { Document } from "mongodb"
import type { DetectedColumn, SelectionMode } from "../types"
import { theme } from "../theme"
import { formatValue, valueColor, detectValueType, padRight, truncate } from "../utils/format"

const SCROLL_MARGIN = 3
const MIN_COL_WIDTH = 6
const MAX_COL_WIDTH = 40
const MINIMIZED_COL_WIDTH = 3
const COL_GAP = 1 // space between columns

interface DocumentListProps {
  documents: Document[]
  columns: DetectedColumn[]
  selectedIndex: number
  selectedColumnIndex: number
  sortField: string | null
  sortDirection: 1 | -1
  selectionMode: SelectionMode
  selectedRows: Set<number>
}

/** Compute natural column widths (no shrinking to fit terminal) */
function computeColumnWidths(
  documents: Document[],
  columns: DetectedColumn[],
): Map<string, number> {
  const visible = columns.filter((c) => c.visible)
  if (visible.length === 0) return new Map()

  const widths = new Map<string, number>()
  const sample = documents.slice(0, 50)

  for (const col of visible) {
    if (col.displayMode === "minimized") {
      widths.set(col.field, MINIMIZED_COL_WIDTH)
      continue
    }

    let maxW = col.field.length
    for (const doc of sample) {
      const val = getNestedValue(doc, col.field)
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

  return widths
}

/** Compute horizontal scroll offset to keep selected column visible */
function computeScrollLeft(
  columns: DetectedColumn[],
  colWidths: Map<string, number>,
  selectedColumnIndex: number,
  viewportWidth: number,
): number {
  const visible = columns.filter((c) => c.visible)
  if (visible.length === 0) return 0

  // Calculate total width
  let totalWidth = 0
  const colPositions: { left: number; right: number }[] = []
  for (const col of visible) {
    const w = colWidths.get(col.field) ?? MIN_COL_WIDTH
    colPositions.push({ left: totalWidth, right: totalWidth + w })
    totalWidth += w + COL_GAP
  }
  totalWidth -= COL_GAP // no gap after last

  // No scrolling needed if everything fits
  const available = viewportWidth - 2 // padding
  if (totalWidth <= available) return 0

  // Ensure selected column is visible
  const sel = colPositions[selectedColumnIndex]
  if (!sel) return 0

  // If selected is to the right of the viewport, scroll right
  // If selected is to the left, scroll left
  // Keep some context around the selected column
  let scrollLeft = 0
  if (sel.right > available) {
    scrollLeft = sel.left - 2 // small margin on left
  }
  if (sel.left < scrollLeft) {
    scrollLeft = sel.left - 2
  }

  return Math.max(0, scrollLeft)
}

/** Build segments for a row: each column padded to width, separated by gaps */
function buildRowSegments(
  values: { text: string; color: string }[],
  colWidths: number[],
): { text: string; color: string }[] {
  const segments: { text: string; color: string }[] = []
  for (let i = 0; i < values.length; i++) {
    const w = colWidths[i]
    segments.push({ text: padRight(values[i].text, w), color: values[i].color })
    if (i < values.length - 1) {
      segments.push({ text: " ", color: theme.bg })
    }
  }
  return segments
}

/** Slice segments to fit in a horizontal viewport */
function sliceSegments(
  segments: { text: string; color: string }[],
  scrollLeft: number,
  viewportWidth: number,
): { text: string; color: string }[] {
  const result: { text: string; color: string }[] = []
  let pos = 0

  for (const seg of segments) {
    const segEnd = pos + seg.text.length

    if (segEnd <= scrollLeft) {
      // Entirely before viewport
      pos = segEnd
      continue
    }
    if (pos >= scrollLeft + viewportWidth) {
      // Entirely after viewport
      break
    }

    // Partially or fully visible
    const start = Math.max(0, scrollLeft - pos)
    const end = Math.min(seg.text.length, scrollLeft + viewportWidth - pos)
    const sliced = seg.text.slice(start, end)
    if (sliced.length > 0) {
      result.push({ text: sliced, color: seg.color })
    }
    pos = segEnd
  }

  return result
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

export function DocumentList({ documents, columns, selectedIndex, selectedColumnIndex, sortField, sortDirection, selectionMode, selectedRows }: DocumentListProps) {
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
    () => computeColumnWidths(documents, columns),
    [documents, columns],
  )

  const viewportWidth = terminalWidth - 2 // padding
  const scrollLeft = useMemo(
    () => computeScrollLeft(visibleColumns, colWidths, selectedColumnIndex, terminalWidth),
    [visibleColumns, colWidths, selectedColumnIndex, terminalWidth],
  )

  const colWidthArray = useMemo(
    () => visibleColumns.map((c) => colWidths.get(c.field) ?? MIN_COL_WIDTH),
    [visibleColumns, colWidths],
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
      <HeaderRow
        columns={visibleColumns}
        colWidthArray={colWidthArray}
        selectedColumnIndex={selectedColumnIndex}
        scrollLeft={scrollLeft}
        viewportWidth={viewportWidth}
        sortField={sortField}
        sortDirection={sortDirection}
      />
      <scrollbox ref={scrollRef} flexGrow={1}>
        {documents.map((doc, i) => (
          <DocumentRow
            key={String(doc._id ?? i)}
            doc={doc}
            columns={visibleColumns}
            colWidthArray={colWidthArray}
            selected={i === selectedIndex}
            selectedColumnIndex={selectedColumnIndex}
            scrollLeft={scrollLeft}
            viewportWidth={viewportWidth}
            rowSelected={selectedRows.has(i)}
            selectionMode={selectionMode}
          />
        ))}
      </scrollbox>
    </box>
  )
}

function HeaderRow({
  columns,
  colWidthArray,
  selectedColumnIndex,
  scrollLeft,
  viewportWidth,
  sortField,
  sortDirection,
}: {
  columns: DetectedColumn[]
  colWidthArray: number[]
  selectedColumnIndex: number
  scrollLeft: number
  viewportWidth: number
  sortField: string | null
  sortDirection: 1 | -1
}) {
  const values = columns.map((col, i) => {
    const isSelectedCol = i === selectedColumnIndex
    const isSorted = sortField === col.field
    const sortIndicator = isSorted ? (sortDirection === 1 ? " ▲" : " ▼") : ""
    const colW = colWidthArray[i]
    let label: string
    if (col.displayMode === "minimized") {
      label = truncate(col.field, MINIMIZED_COL_WIDTH)
    } else if (isSorted) {
      // Truncate field name to ensure indicator always fits within column width
      label = truncate(col.field, colW - sortIndicator.length) + sortIndicator
    } else {
      label = col.field
    }
    const color = isSelectedCol
      ? theme.primary
      : isSorted
        ? theme.warning
        : col.displayMode === "minimized" ? theme.textMuted : theme.textDim
    return { text: label, color }
  })

  const segments = buildRowSegments(values, colWidthArray)
  const visible = sliceSegments(segments, scrollLeft, viewportWidth)

  return (
    <box height={1} width="100%" paddingLeft={1} paddingRight={1}>
      <text>
        {visible.map((seg, i) => (
          <span key={i} fg={seg.color}>{seg.text}</span>
        ))}
      </text>
    </box>
  )
}

function DocumentRow({
  doc,
  columns,
  colWidthArray,
  selected,
  selectedColumnIndex,
  scrollLeft,
  viewportWidth,
  rowSelected,
  selectionMode,
}: {
  doc: Document
  columns: DetectedColumn[]
  colWidthArray: number[]
  selected: boolean
  selectedColumnIndex: number
  scrollLeft: number
  viewportWidth: number
  rowSelected: boolean
  selectionMode: SelectionMode
}) {
  const values = columns.map((col, i) => {
    const w = colWidthArray[i]
    const val = getNestedValue(doc, col.field)
    const text = formatValue(val, w)
    const type = detectValueType(val)
    const isActiveCell = selected && i === selectedColumnIndex
    const color = isActiveCell ? theme.primary : valueColor(type)
    return { text, color }
  })

  const segments = buildRowSegments(values, colWidthArray)
  const visible = sliceSegments(segments, scrollLeft, viewportWidth)

  const bg = rowSelected && selectionMode !== "none"
    ? theme.selection
    : selected
      ? theme.headerBg
      : undefined

  return (
    <box
      height={1}
      width="100%"
      backgroundColor={bg}
      paddingLeft={1}
      paddingRight={1}
    >
      <text>
        {visible.map((seg, i) => (
          <span key={i} fg={seg.color}>{seg.text}</span>
        ))}
      </text>
    </box>
  )
}
