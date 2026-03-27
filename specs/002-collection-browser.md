# Collection Browser

**Status**: Done

## Description

Browse and select collections via the Ctrl+P command palette. Instead of a full-screen list view, collections are presented as a fuzzy-searchable overlay that appears on launch (when no tab is open) and via Ctrl+P.

## Implementation Notes

- Collection names fetched via `db.listCollections()` — fast, no stats
- No upfront stats loading (doc counts, sizes) — unnecessary for browsing
- Collections shown as commands in the generic `CommandPalette` component
- Fuzzy search filters collections as you type
- Enter opens the selected collection in a new tab
- Escape closes the palette (if a tab is already open)
- Palette auto-shows on launch when no tab is open
- Scrollbox with auto-scroll keeps selection visible

## Key Files

- `src/components/CommandPalette.tsx` — Generic palette UI (reused for all commands)
- `src/commands/collections.ts` — Builds collection commands from `CollectionInfo[]`
- `src/commands/types.ts` — Generic `Command` interface
- `src/utils/fuzzy.ts` — Fuzzy matching utility
- `src/providers/mongodb.ts` — `listCollections()`
- `src/hooks/useMongoConnection.ts` — Connects and loads collection list

## Keyboard (in palette)

| Key | Action |
|-----|--------|
| Type | Fuzzy filter |
| `Up` / `Ctrl+P` / `Ctrl+K` | Move selection up |
| `Down` / `Ctrl+N` / `Ctrl+J` | Move selection down |
| `Enter` | Open selected collection |
| `Escape` | Close palette |
| `Backspace` | Delete last search char |
