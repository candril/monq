# Clipboard Yank

**Status**: Done

## Description

Copy the current cell value or full document JSON to the system clipboard using OSC 52 escape sequences. Works over SSH without requiring clipboard tools (xclip, pbcopy, etc.) to be installed.

## Out of Scope

- Pasting from clipboard into the filter bar
- Clipboard ring / history

## Capabilities

### P1 - Must Have

- `y` copies the currently selected cell's formatted value to clipboard
- `Y` copies the full selected document as pretty-printed JSON to clipboard
- Both available via the command palette (`doc:copy-id`, `doc:copy-json`)
- Success shown as a brief toast message

## Implementation Notes

### OSC 52

Clipboard write uses the OSC 52 terminal escape sequence:

```
\x1b]52;c;<base64-encoded-content>\x07
```

This is written directly to `process.stdout`. Works in most modern terminals (iTerm2, WezTerm, kitty, tmux with `set-clipboard on`) and over SSH.

### Cell Value

`y` copies `formatValue(currentCellValue)` — the same string displayed in the table cell (truncated for display but the underlying value is the raw formatted string, not truncated).

### Document JSON

`Y` copies `JSON.stringify(deserializeDocument(selectedDoc), null, 2)` — full EJSON-aware serialization, not just the raw driver document.

## Key Files

- `src/hooks/useKeyboardNav.ts` — `y` and `Y` key handlers with OSC 52 write
- `src/commands/builder.ts` — `doc:copy-json` and `doc:copy-id` palette commands
- `src/utils/format.ts` — `formatValue()` used for cell value representation

## Keyboard

| Key | Action |
|-----|--------|
| `y` | Copy selected cell value to clipboard |
| `Y` | Copy full document JSON to clipboard |
