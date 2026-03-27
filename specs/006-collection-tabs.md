# Collection Tabs

**Status**: In Progress

## Description

Open multiple collections in tabs. Each tab maintains its own query, scroll position, and selected document. Tab state exists in the reducer but the tab bar UI is not yet built.

## What's Done

- Tab state in reducer: `Tab[]` with `id`, `collectionName`, `query`, `queryMode`, `selectedIndex`, `scrollOffset`
- `OPEN_TAB` action: creates tab or switches to existing one
- `CLOSE_TAB` action: removes tab, switches to adjacent
- `SWITCH_TAB` action: saves current tab state, restores target tab state
- Selecting a collection from the palette creates a tab and loads documents

## What's Missing

- **Tab bar UI** — visual bar showing open tabs with active indicator
- **Tab switching keys** — `1-9` number keys, `[`/`]` for prev/next
- **Close tab key** — `d` or `x` to close current tab
- **Per-tab column state** — currently column customizations (display mode) reset on tab switch

## Capabilities

### P1 - Must Have

- Tab bar showing all open tabs with active indicator
- Switch between tabs with `1-9` number keys or `[`/`]`
- Close tab with `d`
- Each tab maintains independent state

### P2 - Should Have

- Tab shows collection name + document count
- Close other tabs via command palette
- Undo close tab (`u`)

## Key Files

- `src/state.ts` — Tab actions: OPEN_TAB, CLOSE_TAB, SWITCH_TAB
- `src/types.ts` — `Tab` interface
- `src/components/TabBar.tsx` — Not yet created

## Keyboard (planned)

| Key | Action |
|-----|--------|
| `1-9` | Switch to tab by number |
| `[` | Previous tab |
| `]` | Next tab |
| `d` | Close current tab |
