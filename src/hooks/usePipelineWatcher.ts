/**
 * Hook: manages the pipeline file watcher lifecycle across tab switches.
 *
 * When the active tab has pipelineWatching=true, starts watching the pipeline
 * file for that tab. When switching away or pipelineWatching becomes false,
 * stops the watcher. This replaces the manual stopWatching() calls that were
 * previously in switchToTab.
 */

import { useEffect } from "react"
import type { Dispatch } from "react"
import type { AppState } from "../types"
import type { AppAction } from "../state"
import { startWatching, stopWatching, reloadFromFile } from "../actions/pipelineWatch"
import { pipelineFilePaths } from "../actions/pipeline"

export function usePipelineWatcher(state: AppState, dispatch: Dispatch<AppAction>) {
  const { activeTabId, pipelineWatching, dbName } = state
  const activeTab = state.tabs.find((t) => t.id === activeTabId)
  const collectionName = activeTab?.collectionName

  useEffect(() => {
    if (!activeTabId || !pipelineWatching || !collectionName) {
      stopWatching()
      return
    }

    const { queryFile } = pipelineFilePaths(dbName, collectionName, activeTabId)
    startWatching(queryFile, () => reloadFromFile(queryFile, dispatch))

    return () => stopWatching()
  }, [activeTabId, pipelineWatching, dbName, collectionName, dispatch])
}
