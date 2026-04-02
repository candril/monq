# Pipeline watcher tab lifecycle

**Status**: Done

## Description

The pipeline file watcher is a global singleton (`src/actions/pipelineWatch.ts`). When the user switches tabs, `switchToTab` calls `stopWatching()`, killing the watcher. When switching back to a tab that had an active tmux pipeline editor, the watcher is never restarted. Edits in the tmux split are silently ignored.

## Reproduction

1. Tab 1: open pipeline editor in tmux split (Ctrl+E) — watcher starts
2. Do some queries / sorts in tab 1 — works, watcher reloads on save
3. Switch to tab 2 (e.g. press `2`) — `stopWatching()` kills the watcher
4. Switch back to tab 1 (press `1`) — watcher is **not restarted**
5. Edit pipeline in tmux and save — nothing happens

## Root Cause

Two related issues:

### 1. Watcher is global, not per-tab

`pipelineWatch.ts` stores a single `activeWatcher` and `debounceTimer`. Only one tab's file can be watched at a time. `stopWatching()` destroys it unconditionally on tab switch.

### 2. Pipeline state is not saved/restored per-tab

`snapshotTab()` and `restoreFromTab()` in `src/state.ts` do not save or restore:
- `pipeline` / `pipelineMode` / `pipelineSource`
- `pipelineWatching` / `pipelineIsAggregate`

Pipeline state is effectively global — switching tabs leaves the previous tab's pipeline active in state but kills the watcher that feeds it.

## Out of Scope

- Multiple simultaneous watchers (watching tab 1's file while viewing tab 2)
- The `$limit` mutation bug (see spec 036)

## Capabilities

### P1 - Must Have

- On tab switch-back, **restart the watcher** if `pipelineWatching` was true for that tab.
- Save/restore pipeline-related state in `snapshotTab` / `restoreFromTab`:
  - `pipeline`, `pipelineMode`, `pipelineSource`, `pipelineIsAggregate`, `pipelineWatching`

### P2 - Should Have

- Store the watched file path per-tab so the watcher can be restarted with the correct path. This can be derived from `pipelineFilePaths(dbName, collectionName, tabId)`.
- Show a visual indicator when the watcher is stale (tab has `pipelineWatching: true` but the actual watcher is stopped).

### P3 - Nice to Have

- Support watching multiple tabs simultaneously (one watcher per tab instead of a global singleton). This would eliminate the stop/restart dance entirely.

## Technical Notes

The watcher restart on tab switch could be implemented as a `useEffect` in `App.tsx` that watches `activeTabId` and the tab's `pipelineWatching` flag:

```typescript
useEffect(() => {
  const tab = state.tabs.find(t => t.id === state.activeTabId)
  if (!tab || !state.pipelineWatching) return
  const { queryFile } = pipelineFilePaths(state.dbName, tab.collectionName, tab.id)
  startWatching(queryFile, () => reloadFromFile(queryFile, dispatch))
  return () => stopWatching()
}, [state.activeTabId, state.pipelineWatching])
```

This replaces the manual `stopWatching()` calls in `switchToTab` with React lifecycle management.

## File Structure

| File | Change |
|------|--------|
| `src/state.ts` | Add pipeline fields to `Tab` type, `snapshotTab`, `restoreFromTab` |
| `src/utils/tabs.ts` | Remove `stopWatching()` from `switchToTab` (watcher managed by effect) |
| `src/App.tsx` (or new hook) | Add effect to start/stop watcher on tab switch |
| `src/actions/pipelineWatch.ts` | Possibly convert to per-tab watcher map (P3) |
