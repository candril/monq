# Command Palette

**Status**: Done (P1 — collection switching)

## Description

A generic Ctrl+P command palette for quick access to all operations. Currently supports collection switching with fuzzy search. Designed to be extended with more commands (document operations, view operations, database switching).

## Implementation Notes

- Generic `CommandPalette` component accepts any `Command[]` + `onSelect` callback
- Fuzzy search with scoring: exact prefix > substring > character-order match
- Scrollbox with auto-scroll for long lists (height 70% of terminal)
- Dark overlay backdrop (`#00000080`)
- Modal dialog at `top={2} left="25%" width="50%"`
- Palette auto-shows on launch when no tab is open
- Input handled via `useKeyboard` (not native `<input>` editing)
- Navigation: Up/Down arrows, Ctrl+P/N, Ctrl+K/J

## Key Files

- `src/components/CommandPalette.tsx` — Generic palette UI
- `src/commands/types.ts` — `Command` interface: `{ id, label, category, shortcut? }`
- `src/commands/collections.ts` — Builds collection commands
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

## Future Commands to Add

- **Document operations**: Edit (e), Copy JSON (y), Copy _id, Delete (D)
- **View operations**: Toggle preview, Toggle columns, Sort by field
- **Database switching**: `db:` prefix to switch databases
- **Query operations**: Save query, Load query, Export results
- **Collection operations**: Count documents, Collection stats
