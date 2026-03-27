/**
 * Collection browser — list of collections with j/k selection.
 * Follows Presto's row selection pattern: scrollbox + subtle highlight.
 */

import { useRef, useEffect } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { CollectionInfo } from "../types"
import { theme } from "../theme"

// Keep N lines visible above/below cursor when scrolling
const SCROLL_MARGIN = 3

interface CollectionListProps {
  collections: CollectionInfo[]
  selectedIndex: number
}

export function CollectionList({ collections, selectedIndex }: CollectionListProps) {
  const scrollRef = useRef<ScrollBoxRenderable>(null)

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

  if (collections.length === 0) {
    return (
      <box flexGrow={1} justifyContent="center" alignItems="center">
        <text>
          <span fg={theme.textDim}>No collections found</span>
        </text>
      </box>
    )
  }

  return (
    <box flexGrow={1} flexDirection="column" overflow="hidden">
      <scrollbox ref={scrollRef} flexGrow={1}>
        {collections.map((col, i) => (
          <CollectionRow
            key={col.name}
            collection={col}
            selected={i === selectedIndex}
          />
        ))}
      </scrollbox>
    </box>
  )
}

interface CollectionRowProps {
  collection: CollectionInfo
  selected: boolean
}

function CollectionRow({ collection, selected }: CollectionRowProps) {
  return (
    <box
      height={1}
      width="100%"
      backgroundColor={selected ? theme.headerBg : undefined}
      paddingLeft={1}
      paddingRight={1}
    >
      <text>
        <span fg={selected ? theme.primary : theme.text}>
          {collection.name}
        </span>
        {collection.type !== "collection" && (
          <span fg={theme.textMuted}> ({collection.type})</span>
        )}
      </text>
    </box>
  )
}
