# Collection Tabs

**Status**: Done

## Description

Open multiple collections simultaneously in tabs. Each tab maintains its own query, sort, column state, scroll position, and selected document independently. Tabs are visually shown in a tab bar when more than one is open.

## Out of Scope

- Persistent tabs across restarts
- Tab reordering (drag/drop)

## Capabilities

### P1 - Must Have

- Tab bar showing all open tabs with active indicator (hidden when only 1 tab open)
- Each tab shows: number + collection name + truncated active query (if any)
- Switch between tabs with `1-9` number keys or `[` / `]` for prev/next
- Close current tab with `d`
- Each tab maintains independent state: query, sort, columns, preview, scroll position

### P2 - Should Have

- Undo close tab with `u` (restores last closed tab's state)
- Clone current tab with `t` (same collection + query, fresh document load)
- Close other tabs via command palette — **not yet implemented**

## Implementation Notes

- Tab state lives in `AppState.tabs: Tab[]` and `activeTabIndex`
- `SWITCH_TAB` saves current in-flight state into `tabs[current]` via `snapshotTab()`, then restores target via `restoreFromTab()`
- `UNDO_CLOSE_TAB` pops `closedTabStack` — limited to last closed tab
- `CLONE_TAB` copies the current tab's collection + query and opens a fresh load
- Tab bar hidden via `tabs.length < 2` check in `Shell.tsx`
- Tab numbers shown 1-indexed; `1-9` keys use `index = Number(key) - 1`

## Key Files

- `src/state.ts` — `OPEN_TAB`, `CLOSE_TAB`, `SWITCH_TAB`, `CLONE_TAB`, `UNDO_CLOSE_TAB`
- `src/types.ts` — `Tab` interface
- `src/components/TabBar.tsx` — Tab bar UI (Presto-style numbered tabs)
- `src/hooks/useKeyboardNav.ts` — `1-9`, `[`, `]`, `d`, `u`, `t` key handlers

## Keyboard

| Key | Action |
|-----|--------|
| `1-9` | Switch to tab by number |
| `[` | Previous tab |
| `]` | Next tab |
| `d` | Close current tab |
| `u` | Undo last close |
| `t` | Clone current tab |
