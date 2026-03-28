# Command Palette

**Status**: Done

## Description

A generic `Ctrl+P` command palette for quick access to all operations. Supports fuzzy search across categorized commands. Auto-shows on launch when no collection is open. The command set is state-aware and dynamically built from `src/commands/builder.ts`.

## Out of Scope

- Database switching (separate spec if needed)
- Saved / named queries via palette

## Capabilities

### P1 - Must Have

- Generic `CommandPalette` component accepts `Command[]` + `onSelect` callback
- Fuzzy search with scoring: exact prefix > substring > character-order match
- Category headers separating command groups
- Scrollbox with auto-scroll for long lists
- Dark overlay backdrop
- Modal at `top=2 left="25%" width="50%"`
- Auto-show on launch when no tab is open
- Keyboard-driven navigation

### P2 - Should Have

- State-aware command set built dynamically:
  - **Navigation**: Open Collection (one per available collection)
  - **Document**: Edit, Copy JSON (`y`), Copy _id, Filter from Value
  - **View**: Toggle preview, Cycle preview position, Reload
  - **Query**: Open filter, Open pipeline editor, Clear pipeline, Toggle pipeline bar, Clear filter, Format BSON, Sort by column
- Keyboard shortcut hints shown per command

## Implementation Notes

- `Command` interface: `{ id: string; label: string; category: string; shortcut?: string }`
- `CATEGORY_ORDER` controls display order: Navigation, Document, View, Query
- `buildCommands(state)` in `src/commands/builder.ts` produces the full list based on current state
- Collection commands (`open:<name>`) handled by `buildCollectionCommands(collections)`
- Palette opened via `OPEN_COMMAND_PALETTE` action; closed via `CLOSE_COMMAND_PALETTE` or Escape

## Key Files

- `src/components/CommandPalette.tsx` — Generic palette UI with `PaletteRow` sub-component
- `src/commands/types.ts` — `Command` interface and `CATEGORY_ORDER`
- `src/commands/collections.ts` — Collection command builder
- `src/commands/builder.ts` — State-aware full command builder
- `src/utils/fuzzy.ts` — `fuzzyScore()` and `fuzzyFilter()` utilities

## Keyboard (in palette)

| Key | Action |
|-----|--------|
| Type | Fuzzy filter |
| `Up` / `Ctrl+P` / `Ctrl+K` | Move selection up |
| `Down` / `Ctrl+N` / `Ctrl+J` | Move selection down |
| `Enter` | Execute selected command |
| `Escape` | Close palette |
| `Backspace` | Delete last search char |
