/**
 * Shared tab-switching helper.
 * Pipeline state (including pipelineWatching) is saved/restored per-tab
 * via snapshotTab/restoreFromTab. The actual fs watcher is started/stopped
 * by usePipelineWatcher() in App.tsx based on the restored state.
 */

import type { Dispatch } from "react"
import type { AppAction } from "../state"

/** Switch to the given tab. Pipeline watcher lifecycle is managed by effect. */
export function switchToTab(tabId: string, dispatch: Dispatch<AppAction>): void {
  dispatch({ type: "SWITCH_TAB", tabId })
}
