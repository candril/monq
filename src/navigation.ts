/**
 * App-level navigation callbacks.
 * Registered once by Root in index.tsx; called from anywhere (hooks, actions)
 * without prop-threading — same pattern as stopWatching() in pipelineWatch.ts.
 */

let _switchConnection: (() => void) | null = null

export function registerSwitchConnection(fn: () => void) {
  _switchConnection = fn
}

export function switchConnection() {
  _switchConnection?.()
}
