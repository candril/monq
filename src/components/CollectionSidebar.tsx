/**
 * Collection sidebar (spec 053) — vertical, collapsible navigation pane
 * listing every collection in the current database.
 *
 * Purely presentational: the cursor index, focus state, and visibility are
 * owned by `AppState`. Keyboard handling lives in `useKeyboardNav` and the
 * action helpers in `src/actions/sidebar.ts`.
 *
 * Collection state is communicated purely through colour (no glyphs), so
 * the list reads as a clean single-column name list:
 *
 *   theme.textDim      — regular collection, no open tab
 *   theme.text         — collection that has at least one open tab
 *   theme.primary      — collection that's in the currently-active tab
 *   theme.selection bg — the focused cursor row (on top of the above)
 *
 * Long names are truncated with an ellipsis so a single-line-per-row layout
 * is preserved (wrapping used to produce "strange empty lines").
 */

import { useRef, useEffect } from "react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { CollectionInfo } from "../types"
import { theme } from "../theme"

export const SIDEBAR_WIDTH = 24
const SCROLL_MARGIN = 2
// Content width inside the sidebar, once the right border (1) and horizontal
// padding (2) are subtracted. Leave a 1-col safety margin so names never
// bump against the border.
const CONTENT_WIDTH = SIDEBAR_WIDTH - 1 - 2 - 1

interface CollectionSidebarProps {
  dbName: string
  collections: CollectionInfo[]
  activeCollectionName: string
  openCollectionNames: Set<string>
  selectedIndex: number
  focused: boolean
}

/** Truncate a collection name to `CONTENT_WIDTH`, appending an ellipsis. */
function truncate(name: string): string {
  if (name.length <= CONTENT_WIDTH) {
    return name
  }
  return name.slice(0, CONTENT_WIDTH - 1) + "…"
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
          <span fg={theme.textMuted}>{"─".repeat(CONTENT_WIDTH + 1)}</span>
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
              name={col.name}
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
  name: string
  isActive: boolean
  hasOpen: boolean
  isCursor: boolean
}

function SidebarRow({ name, isActive, hasOpen, isCursor }: SidebarRowProps) {
  // Colour encodes collection state; cursor row gets the selection background
  // on top. No glyphs — the colour alone communicates everything.
  const fg = isActive ? theme.primary : hasOpen ? theme.text : theme.textDim
  return (
    <box width="100%" height={1} backgroundColor={isCursor ? theme.selection : undefined}>
      <text>
        <span fg={fg}>{truncate(name)}</span>
      </text>
    </box>
  )
}
