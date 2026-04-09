/**
 * Tab bar — shown only when multiple tabs are open.
 * Presto-style: • for active tab, number prefix, collection name + filter.
 */

import type { Tab } from "../types"
import { theme } from "../theme"

interface TabBarProps {
  tabs: Tab[]
  activeTabId: string | null
}

/** Condensed filter display */
function filterSuffix(query: string): string {
  if (!query) {
    return ""
  }
  const short = query.trim().length > 20 ? query.trim().slice(0, 19) + "~" : query.trim()
  return ` [${short}]`
}

export function TabBar({ tabs, activeTabId }: TabBarProps) {
  if (tabs.length <= 1) {
    return null
  }

  return (
    <box height={1} backgroundColor={theme.headerBg} paddingX={1} flexDirection="row">
      {tabs.map((tab, i) => {
        const active = tab.id === activeTabId
        const filter = filterSuffix(tab.query)
        // Ephemeral tabs render dim regardless of active state so the eye
        // immediately spots which tabs are real work (spec 054).
        const numberColor = tab.ephemeral ? theme.textDim : active ? theme.primary : theme.textDim
        const nameColor = tab.ephemeral ? theme.textDim : active ? theme.text : theme.textDim
        return (
          <box key={tab.id} marginRight={2}>
            <text>
              <span fg={numberColor}>{i + 1}:</span>
              <span fg={nameColor}>{tab.collectionName}</span>
              {filter && <span fg={theme.textMuted}>{filter}</span>}
            </text>
          </box>
        )
      })}
    </box>
  )
}
