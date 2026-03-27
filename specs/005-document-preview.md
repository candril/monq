# Document Preview

**Status**: Done

## Description

A syntax-highlighted JSON preview panel for the selected document, using OpenTUI's `<code>` component with tree-sitter JSON highlighting. Shown as a right or bottom split.

## Implementation Notes

- Uses OpenTUI `<code>` component with `filetype="json"` and custom `SyntaxStyle`
- JSON serialized via EJSON (preserves BSON types like ObjectId, Date)
- Tree-sitter JSON parser registered at startup via `addDefaultParsers()`
- `drawUnstyledText: false` and `conceal: false` to prevent flicker on document change
- Right position: 50% width, left border
- Bottom position: 50% height, top border
- Scrollbox with externally-controlled scroll offset
- Preview updates reactively as j/k moves through documents
- Tokyo Night themed syntax style for JSON tokens

## Key Files

- `src/components/DocumentPreview.tsx` — Preview panel with `<code>` rendering
- `src/syntax-parsers.ts` — JSON tree-sitter parser registration
- `src/providers/mongodb.ts` — `serializeDocument()` (EJSON)

## Keyboard

| Key | Action |
|-----|--------|
| `p` | Toggle preview panel on/off |
| `P` | Cycle position: right ↔ bottom |
| `Ctrl+D` | Scroll preview down 10 lines |
| `Ctrl+U` | Scroll preview up 10 lines |

## Future (P2)

- Drill into subdocuments (Enter on nested object, Backspace to go back)
- Copy field value to clipboard (`y`)
- Filter from value (`f` on a field → add to query bar)
