# Pipeline Live Reload

**Status**: Ready

## Description

Watch the active pipeline file for external changes and automatically reload results in monq when the file is saved. Optionally open a tmux split pointing at the pipeline file so an editor or AI agent (e.g. OpenCode, Cursor) can work on the pipeline while monq updates live on the left.

Each tab gets its own pipeline file, scoped by db + collection + tab ID, so multiple tabs on the same collection (or same collection across different databases) never share a file.

## Out of Scope

- Watching simple-mode query input for external changes
- Live/streaming results while the file is being edited (reload on save only)
- Non-tmux terminal multiplexers (iTerm2 splits, Zellij, etc.) — first-class support for tmux only; others can open the file path manually

## Capabilities

### P1 - Must Have

- **File watcher**: when a pipeline is active, watch `pipeline.jsonc` with `fs.watch()`; on `rename`/`change` event debounce 150 ms then re-parse and reload
- **Auto-reload**: same parse + classify + fetch flow as after `Ctrl+F` edit; errors shown as toast (do not clear the existing pipeline)
- **Watch indicator**: small `[watching]` badge or `~` suffix in the pipeline bar status line while the watcher is active
- **Stop watching**: watcher stops when pipeline is cleared (`/` or `Backspace`)

### P2 - Should Have

- **`Ctrl+E` opens a tmux split** with the pipeline file:
  - Detect `$TMUX` env var; if not in tmux, fall back to opening in `$EDITOR` (existing `Ctrl+F` behaviour)
  - Split direction: vertical (side-by-side), 50% width by default
  - Command: `tmux split-window -h -p 50 "$EDITOR $pipelineFile"`
  - Does **not** suspend the monq renderer — the split runs in a separate pane
  - Writes the pipeline file (same pre-population logic as `Ctrl+F`) before opening the split
  - Monq stays running and picking up file changes via the watcher
- **Configurable split direction**: honour `MONQ_TMUX_SPLIT` env var: `h` (horizontal, stacked) or `v` (vertical, side-by-side, default)

### P3 - Nice to Have

- Print the pipeline file path to the status bar so the user can open it in any tool
- `Ctrl+E` when not in tmux: copy file path to clipboard (OSC 52) so user can paste into another pane
- Support Zellij: detect `$ZELLIJ` and use `zellij action new-pane`

## Technical Notes

### Pipeline File Path

Each tab's pipeline file is scoped to `db + collection + tabId` so two tabs on the same collection (or the same collection name across two databases) never collide:

```typescript
import { tmpdir } from "os"
import { join } from "path"

function pipelineFilePath(dbName: string, collectionName: string, tabId: string) {
  // tabId already makes the path unique, but db+collection in the path
  // keeps it human-readable when browsing $TMPDIR/monq/
  const dir = join(tmpdir(), "monq", dbName, collectionName, tabId)
  return {
    dir,
    queryFile:  join(dir, "pipeline.jsonc"),
    schemaFile: join(dir, ".monq-pipeline-schema.json"),
  }
}
```

This replaces the current scheme in `src/actions/pipeline.ts` which only uses `collectionName`:
```typescript
// Before (spec 012 — collection-unique only):
const dir = join(tmpdir(), "monq", collectionName)

// After (spec 018 — db + collection + tab unique):
const dir = join(tmpdir(), "monq", dbName, collectionName, tabId)
```

`tabId` is `Tab.id` from `src/types.ts` — a stable string assigned when the tab is created (e.g. timestamp-based). It survives tab switches and pipeline clears; a new tab always gets a new ID.

### File Watcher

```typescript
import { watch, type FSWatcher } from "fs"

let watcher: FSWatcher | null = null

function startWatching(filePath: string, onReload: () => void) {
  stopWatching()
  let debounce: ReturnType<typeof setTimeout> | null = null
  watcher = watch(filePath, () => {
    if (debounce) clearTimeout(debounce)
    debounce = setTimeout(onReload, 150)
  })
}

function stopWatching() {
  watcher?.close()
  watcher = null
}
```

`onReload` dispatches `RELOAD_PIPELINE_FROM_FILE` — re-reads the file, parses, classifies, and sets the pipeline (same logic as the post-editor flow in `src/actions/pipeline.ts`).

### Tmux Split

```typescript
import { spawn } from "child_process"

function openTmuxSplit(filePath: string) {
  const editor = process.env.EDITOR ?? "nvim"
  const direction = process.env.MONQ_TMUX_SPLIT === "h" ? "-v" : "-h"
  const pct = "50"
  // spawn detached — monq keeps running
  spawn("tmux", ["split-window", direction, `-p`, pct, `${editor} "${filePath}"`], {
    detached: true,
    stdio: "ignore",
  }).unref()
}
```

Key difference from `Ctrl+F`: **no `renderer.suspend()`**. The tmux pane is independent; monq continues rendering and watching.

### State

```typescript
// New AppState fields
pipelineWatching: boolean    // true while fs.watch is active
```

New actions:
- `START_PIPELINE_WATCH` — set `pipelineWatching = true`
- `STOP_PIPELINE_WATCH` — set `pipelineWatching = false`
- `RELOAD_PIPELINE_FROM_FILE` — re-read, parse, classify, set pipeline (side-effectful, handled outside reducer via `useKeyboardNav` / `useDocumentLoader`)

### Pipeline Bar Badge

When `pipelineWatching`:
- Append ` ~` to the pipeline bar mode badge: `[aggregate ~]` or `[pipeline ~]`
- Or show a small `watching` label in dim color at the right end of the bar

## File Structure

### New Files
- `src/actions/pipelineWatch.ts` — `startWatching()`, `stopWatching()`, `reloadFromFile()`

### Modified Files
- `src/actions/pipeline.ts` — change temp dir from `monq/{collectionName}` to `monq/{dbName}/{collectionName}/{tabId}`; extract file-read + parse + classify into a reusable `parsePipelineFile(path)` function; accept `tabId` in params
- `src/state.ts` — add `pipelineWatching`, `START_PIPELINE_WATCH`, `STOP_PIPELINE_WATCH`
- `src/components/PipelineBar.tsx` — render `~` / `watching` indicator
- `src/hooks/useKeyboardNav.ts` — `Ctrl+E` handler; start watcher after `Ctrl+F` edit completes; stop on `CLEAR_PIPELINE`
- `src/App.tsx` — cleanup: call `stopWatching()` on renderer destroy

## Key Bindings

| Key | Context | Action |
|-----|---------|--------|
| `Ctrl+E` | pipeline active or empty | Write pipeline file + open tmux split (or `$EDITOR` if not in tmux) |
| `Ctrl+F` | anywhere | Existing: open `$EDITOR` blocking (suspend renderer); also starts file watcher on return |
| `/` | pipeline active | Clear pipeline + stop watcher (existing behaviour) |
| `Backspace` | pipeline bar visible | Clear pipeline + stop watcher (existing behaviour) |
