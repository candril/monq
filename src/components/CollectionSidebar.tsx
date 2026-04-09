/**
 * Collection sidebar (spec 053) — vertical, collapsible navigation pane
 * listing every collection in the current database.
 *
 * Purely presentational: the cursor index, focus state, and visibility are
 * owned by `AppState`. Keyboard handling lives in `useKeyboardNav` and the
 * action helpers in `src/actions/sidebar.ts`.
 *
 * Visual markers:
 *   ▶  the collection in the active tab
 *   ●  any collection that has at least one open tab
 *   v  view (non-collection type tag)
 *   t  timeseries (non-collection type tag)
 */

import { useRef, useEffect } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { CollectionInfo } from "../types"
import { theme } from "../theme"

const SIDEBAR_WIDTH = 24
const SCROLL_MARGIN = 2

interface CollectionSidebarProps {
  dbName: string
  collections: CollectionInfo[]
  activeCollectionName: string
  openCollectionNames: Set<string>
  selectedIndex: number
  focused: boolean
}

export function CollectionSidebar({
  dbName,
  collections,
  activeCollectionName,
  openCollectionNames,
  selectedIndex,
  focused,
}: CollectionSidebarProps) {
  const scrollRef = useRef<ScrollBoxRenderable>(null)

  // Keep the cursor row visible as the user navigates.
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
      const maxScroll = Math.max(0, collections.length - viewportHeight)
      const target = selectedIndex - viewportHeight + SCROLL_MARGIN + 1
      scrollbox.scrollTo(Math.min(target, maxScroll))
    }
  }, [selectedIndex, collections.length])

  return (
    <box
      width={SIDEBAR_WIDTH}
      height="100%"
      flexDirection="column"
      backgroundColor={theme.bg}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenTUI border prop not typed
      border={["right"] as any}
      borderColor={theme.border}
      paddingX={1}
    >
      <box height={1}>
        <text>
          <span fg={theme.primary}>{dbName || "(no db)"}</span>
        </text>
      </box>
      <box height={1}>
        <text>
          <span fg={theme.textMuted}>{"─".repeat(SIDEBAR_WIDTH - 2)}</span>
        </text>
      </box>
      {collections.length === 0 ? (
        <box paddingTop={1}>
          <text>
            <span fg={theme.textMuted}>(no collections)</span>
          </text>
        </box>
      ) : (
        <scrollbox ref={scrollRef} flexGrow={1}>
          {collections.map((col, i) => (
            <SidebarRow
              key={col.name}
              col={col}
              isActive={col.name === activeCollectionName}
              hasOpen={openCollectionNames.has(col.name)}
              isCursor={focused && i === selectedIndex}
            />
          ))}
        </scrollbox>
      )}
    </box>
  )
}

interface SidebarRowProps {
  col: CollectionInfo
  isActive: boolean
  hasOpen: boolean
  isCursor: boolean
}

function SidebarRow({ col, isActive, hasOpen, isCursor }: SidebarRowProps) {
  const marker = isActive ? "▶ " : "  "
  const nameColor = isActive ? theme.primary : isCursor ? theme.text : theme.textDim
  const markerColor = isCursor ? theme.text : theme.textDim
  const typeTag = col.type === "view" ? " v" : col.type === "timeseries" ? " t" : ""
  return (
    <box height={1} flexDirection="row" backgroundColor={isCursor ? theme.selection : undefined}>
      <text>
        <span fg={markerColor}>{marker}</span>
        <span fg={nameColor}>{col.name}</span>
        {hasOpen && <span fg={theme.textDim}>{" ●"}</span>}
        {typeTag && <span fg={theme.textMuted}>{typeTag}</span>}
      </text>
    </box>
  )
}
