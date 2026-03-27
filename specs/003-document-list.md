# Document List

**Status**: Done

## Description

Display documents from a collection in a tabular format with auto-detected columns. Columns are sorted: `_id` first, then scalars alphabetically, then complex types alphabetically. Supports horizontal column selection and column width cycling.

## Implementation Notes

- Columns auto-detected from first 50 documents (fields in >30% of docs)
- `_id` always first, scalars before objects/arrays, then alphabetical
- Full ObjectId shown (not truncated)
- Complex values (objects, arrays) rendered as compact JSON: `{"key":"val~`
- Type-based coloring: strings green, numbers orange, booleans purple, null dim, etc.
- Horizontal scrolling when total column width exceeds terminal
- Selected column highlighted in header and active cell
- Column display modes: normal (auto-fit, max 40), full (uncapped), minimized (3 chars)
- Columns never wider than needed (max of header name, content)
- Presto-style row selection: subtle `headerBg` highlight
- Scrollbox with auto-scroll and SCROLL_MARGIN

## Key Files

- `src/components/DocumentList.tsx` — Table with header, rows, horizontal scrolling
- `src/utils/format.ts` — Value formatting, type detection, coloring, truncation
- `src/hooks/useDocumentLoader.ts` — Fetches documents on tab change / reload
- `src/providers/mongodb.ts` — `fetchDocuments()`, `detectColumns()`

## Keyboard (in document view)

| Key | Action |
|-----|--------|
| `j` / `Down` | Move to next document |
| `k` / `Up` | Move to previous document |
| `h` / `Left` | Move column cursor left |
| `l` / `Right` | Move column cursor right |
| `w` | Cycle column width: normal → full → minimized → normal |
| `r` | Reload documents |
| `e` | Edit selected document in $EDITOR |
| `p` | Toggle preview panel |
| `P` | Cycle preview position (right ↔ bottom) |
