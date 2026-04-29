/**
 * Document list — tabular display with auto-detected columns.
 * Supports horizontal scrolling when columns exceed terminal width.
 * h/l moves column cursor, j/k moves row cursor, w cycles column width mode.
 */

import { useRef, useEffect, useMemo, useState } from "react"
import type React from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import { useTerminalDimensions } from "@opentui/react"
import type { Document } from "mongodb"
import type { DetectedColumn, SelectionMode } from "../types"
import { theme, getMarkColor } from "../theme"
import {
  formatValue,
  valueColor,
  detectValueType,
  padRight,
  truncate,
  getNestedValue,
} from "../utils/format"
import { markDocId } from "../utils/marks"
import { Loading } from "./Loading"
import { randomDocumentMessage } from "../utils/loadingMessages"

const SCROLL_MARGIN = 3
const MIN_COL_WIDTH = 6
const MAX_COL_WIDTH = 40
const MINIMIZED_COL_WIDTH = 3
const COL_GAP = 1 // space between columns
const SORT_INDICATOR_WIDTH = 2 // " ▴" or " ▾"

interface DocumentListProps {
  documents: Document[]
  columns: DetectedColumn[]
  selectedIndex: number
  selectedColumnIndex: number
  sortField: string | null
  sortDirection: 1 | -1
  selectionMode: SelectionMode
  selectedRows: Set<number>
  loading?: boolean
  scrollRef?: React.RefObject<ScrollBoxRenderable>
  themeVersion?: number
  /** Effective viewport width in columns. Defaults to full terminal width. */
  viewportWidth?: number
  /**
   * Mark letter per canonical doc id (from `markDocId`). When non-empty, a
   * 1-char gutter is rendered to the left of each row.
   */
  marksForRow?: Map<string, string>
}

/** Compute natural column widths, then expand capped columns to fill available screen width */
function computeColumnWidths(
  documents: Document[],
  columns: DetectedColumn[],
  availableWidth: number,
): Map<string, number> {
  const visible = columns.filter((c) => c.visible)
  if (visible.length === 0) {
    return new Map()
  }

  const widths = new Map<string, number>()
  const naturalWidths = new Map<string, number>() // uncapped natural width
  const sample = documents.slice(0, 50)

  for (const col of visible) {
    if (col.displayMode === "minimized") {
      widths.set(col.field, MINIMIZED_COL_WIDTH)
      naturalWidths.set(col.field, MINIMIZED_COL_WIDTH)
      continue
    }

    // Reserve space for the sort indicator so that toggling sort never causes truncation.
    const headerMinW = col.field.length + SORT_INDICATOR_WIDTH
    let maxW = headerMinW
    let naturalW = headerMinW
    for (const doc of sample) {
      const val = getNestedValue(doc, col.field)
      const formatted = formatValue(val, 200)
      naturalW = Math.max(naturalW, formatted.length)
      maxW = Math.max(maxW, Math.min(MAX_COL_WIDTH, formatted.length))
    }

    naturalWidths.set(col.field, Math.max(MIN_COL_WIDTH, naturalW))

    if (col.displayMode === "full") {
      widths.set(col.field, Math.max(MIN_COL_WIDTH, naturalW))
    } else {
      widths.set(col.field, Math.min(MAX_COL_WIDTH, Math.max(MIN_COL_WIDTH, maxW)))
    }
  }

  // Second pass: if total width is less than available, expand capped columns up to their
  // natural content width. Distribute surplus evenly among columns that still have room to grow,
  // iterating until surplus is exhausted or no column can grow further.
  const totalGaps = Math.max(0, visible.length - 1) * COL_GAP
  let totalUsed = totalGaps
  for (const col of visible) {
    totalUsed += widths.get(col.field) ?? 0
  }

  let surplus = availableWidth - totalUsed
  while (surplus > 0) {
    const growable = visible.filter((col) => {
      if (col.displayMode === "minimized" || col.displayMode === "full") {
        return false
      }
      return (naturalWidths.get(col.field) ?? 0) > (widths.get(col.field) ?? 0)
    })
    if (growable.length === 0) {
      break
    }

    const perCol = Math.floor(surplus / growable.length)
    const remainder = surplus % growable.length
    let allocated = 0

    for (let i = 0; i < growable.length; i++) {
      const col = growable[i]
      const current = widths.get(col.field) ?? 0
      const natural = naturalWidths.get(col.field) ?? current
      const share = perCol + (i < remainder ? 1 : 0)
      const grant = Math.min(natural - current, share)
      widths.set(col.field, current + grant)
      allocated += grant
    }

    if (allocated === 0) {
      break
    }
    surplus -= allocated
  }

  return widths
}

/**
 * Compute horizontal scroll offset to keep the selected column visible.
 * `textAreaWidth` is the actual width available for column text (already
 * minus row padding and mark gutter). `prevScrollLeft` is the scroll
 * position from the previous render — we keep it stable while the
 * selected column still fits in view, and only scroll the minimum needed
 * to bring it back on-screen otherwise.
 */
function computeScrollLeft(
  columns: DetectedColumn[],
  colWidths: Map<string, number>,
  selectedColumnIndex: number,
  textAreaWidth: number,
  prevScrollLeft: number,
): number {
  const visible = columns.filter((c) => c.visible)
  if (visible.length === 0) {
    return 0
  }

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
  if (totalWidth <= textAreaWidth) {
    return 0
  }

  // Start from the previous position, clamped to the valid range. This
  // keeps the viewport stable while the selection moves through visible
  // columns.
  const maxScroll = totalWidth - textAreaWidth
  let scrollLeft = Math.max(0, Math.min(prevScrollLeft, maxScroll))

  const sel = colPositions[selectedColumnIndex]
  if (!sel) {
    return scrollLeft
  }

  if (sel.right > scrollLeft + textAreaWidth) {
    // Past the right edge — scroll right just enough to anchor the
    // selected column to the right edge (with a 1-char margin).
    scrollLeft = sel.right - textAreaWidth + 1
  } else if (sel.left < scrollLeft) {
    // Past the left edge — scroll left just enough to anchor the selected
    // column to the left edge.
    scrollLeft = sel.left
  }

  return Math.max(0, Math.min(scrollLeft, maxScroll))
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

export function DocumentList({
  documents,
  columns,
  selectedIndex,
  selectedColumnIndex,
  sortField,
  sortDirection,
  selectionMode,
  selectedRows,
  loading,
  scrollRef: externalScrollRef,
  viewportWidth: viewportWidthProp,
  marksForRow,
}: DocumentListProps) {
  // Always reserve the gutter so the layout never shifts when the first mark
  // appears in a collection. Costs 2 chars of horizontal space, but avoids the
  // jarring jump that the conditional gutter caused.
  const showMarkGutter = true
  const scrollRef = externalScrollRef ?? useRef<ScrollBoxRenderable>(null)
  const { width: terminalWidth } = useTerminalDimensions()
  const [loadingMessage, setLoadingMessage] = useState(randomDocumentMessage)
  useEffect(() => {
    if (!loading) {
      return
    }
    const timer = setInterval(() => setLoadingMessage(randomDocumentMessage()), 5000)
    return () => clearInterval(timer)
  }, [loading])

  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox) {
      return
    }
    const viewportHeight = scrollbox.viewport?.height ?? 20
    const scrollTop = scrollbox.scrollTop
    const scrollBottom = scrollTop + viewportHeight

    if (selectedIndex < scrollTop + SCROLL_MARGIN) {
      scrollbox.scrollTo(Math.max(0, selectedIndex - SCROLL_MARGIN))
    } else if (selectedIndex >= scrollBottom - SCROLL_MARGIN) {
      scrollbox.scrollTo(selectedIndex - viewportHeight + SCROLL_MARGIN + 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- scrollRef is a stable ref, selectedIndex is the only trigger
  }, [selectedIndex])

  const visibleColumns = columns.filter((c) => c.visible)
  // Use the explicit viewport width when provided (e.g. when a preview panel is open
  // and the document list only occupies part of the terminal width). Fall back to the
  // full terminal width. We subtract 2 for the row's left/right padding, and another
  // 2 for the mark gutter when shown — both sit inside the same flex row as the
  // column text, so the text only gets the remaining space.
  const effectiveTerminalWidth = viewportWidthProp ?? terminalWidth
  const viewportWidth = effectiveTerminalWidth - 2 - (showMarkGutter ? 2 : 0)
  const colWidths = useMemo(
    () => computeColumnWidths(documents, columns, viewportWidth),
    [documents, columns, viewportWidth],
  )
  // Persist the horizontal scroll across renders so we can keep the
  // viewport stable while the cursor moves through already-visible columns.
  // The compute is idempotent: feeding back the same scrollLeft yields the
  // same result, so mutating the ref during render is safe.
  const scrollLeftRef = useRef(0)
  const scrollLeft = computeScrollLeft(
    visibleColumns,
    colWidths,
    selectedColumnIndex,
    viewportWidth,
    scrollLeftRef.current,
  )
  scrollLeftRef.current = scrollLeft

  const colWidthArray = useMemo(
    () => visibleColumns.map((c) => colWidths.get(c.field) ?? MIN_COL_WIDTH),
    [visibleColumns, colWidths],
  )

  if (documents.length === 0) {
    return loading ? (
      <Loading message={loadingMessage} />
    ) : (
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
        showMarkGutter={showMarkGutter}
      />
      <scrollbox
        ref={scrollRef}
        flexGrow={1}
        style={{
          scrollbarOptions: {
            trackOptions: {
              backgroundColor: theme.bg,
              foregroundColor: theme.bg,
            },
          },
        }}
      >
        {documents.map((doc, i) => {
          const markLetter = showMarkGutter ? (marksForRow?.get(markDocId(doc._id)) ?? null) : null
          return (
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
              showMarkGutter={showMarkGutter}
              markLetter={markLetter}
            />
          )
        })}
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
  showMarkGutter,
}: {
  columns: DetectedColumn[]
  colWidthArray: number[]
  selectedColumnIndex: number
  scrollLeft: number
  viewportWidth: number
  sortField: string | null
  sortDirection: 1 | -1
  showMarkGutter: boolean
}) {
  const values = columns.map((col, i) => {
    const isSelectedCol = i === selectedColumnIndex
    const isSorted = sortField === col.field
    const sortIndicator = isSorted ? (sortDirection === 1 ? " ▴" : " ▾") : ""
    const colW = colWidthArray[i]
    let label: string
    if (col.displayMode === "minimized") {
      label = truncate(col.field, MINIMIZED_COL_WIDTH)
    } else {
      // Column widths already reserve SORT_INDICATOR_WIDTH, so the indicator always fits.
      // Truncate only to the available column width minus indicator length.
      label = truncate(col.field, colW - sortIndicator.length) + sortIndicator
    }
    const color = isSelectedCol
      ? theme.primary
      : isSorted
        ? theme.warning
        : col.displayMode === "minimized"
          ? theme.textMuted
          : theme.textDim
    return { text: label, color }
  })

  const segments = buildRowSegments(values, colWidthArray)
  const visible = sliceSegments(segments, scrollLeft, viewportWidth)

  return (
    <box height={1} width="100%" paddingLeft={1} paddingRight={1} flexDirection="row">
      {showMarkGutter && <box width={2} />}
      <text>
        {visible.map((seg, i) => (
          <span key={i} fg={seg.color}>
            {seg.text}
          </span>
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
  showMarkGutter,
  markLetter,
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
  showMarkGutter: boolean
  markLetter: string | null
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

  const bg =
    rowSelected && selectionMode !== "none"
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
      flexDirection="row"
    >
      {showMarkGutter && (
        <box width={2}>
          <text>
            {markLetter ? (
              <span fg={getMarkColor(markLetter)}>{markLetter}</span>
            ) : (
              <span fg={theme.textDim}> </span>
            )}
          </text>
        </box>
      )}
      <text>
        {visible.map((seg, i) => (
          <span key={i} fg={seg.color}>
            {seg.text}
          </span>
        ))}
      </text>
    </box>
  )
}
