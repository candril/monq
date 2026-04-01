/**
 * Shared tab-switching helper.
 * Stops any active pipeline watcher and dispatches SWITCH_TAB.
 */

import type { Dispatch } from "react"
import type { AppAction } from "../state"
import { stopWatching } from "../actions/pipelineWatch"

/** Stop pipeline watching and switch to the given tab. */
export function switchToTab(tabId: string, dispatch: Dispatch<AppAction>): void {
  stopWatching()
  dispatch({ type: "STOP_PIPELINE_WATCH" })
  dispatch({ type: "SWITCH_TAB", tabId })
}
