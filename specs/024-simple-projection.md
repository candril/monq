# Simple Mode Projection

**Status**: Draft

## Description

Extend the simple filter bar with inline projection tokens. `+field` includes a field,
bare `-field` (no operator) excludes it. Tokens coexist in the same query string as
filter tokens — no separator needed. Dot-notation is supported for nested fields.
No unwind / array flattening — that is a pipeline concern.

## Out of Scope

- Array unwinding / `$unwind` (use pipeline editor for that)
- Column rename / aliases (possible future extension)
- Projection in BSON mode (already handled via the projection textarea)
- Aggregation `$project` stage (pipeline only)

## Capabilities

### P1 - Must Have

- Parse `|` separator in `queryInput` to split filter tokens from projection tokens
- Bare `field` or `field.nested` → include (`{ field: 1 }`)
- `-field` prefix → exclude (`{ field: 0 }`)
- Pass parsed projection to `fetchDocuments` as the `projection` option
- Display active projection in the filter bar badge/label (e.g. `[Simple | 3 fields]`)
- Backspace / clear filter also clears projection

### P2 - Should Have

- Field autocomplete on the projection side (same schema-aware suggestions as filter side)
- Migrate projection to BSON mode: when switching simple → BSON, populate the projection textarea
- Migrate back: when switching BSON → simple, carry projection back if it is a flat inclusion/exclusion map
- Syntax error feedback if projection token is invalid

### P3 - Nice to Have

- Highlight projected columns in the document table header
- `query:toggle-projection` command palette entry to quickly clear projection

## Technical Notes

### Syntax

Projection tokens live inline in the same query string as filter tokens:

```
Author:Peter State:Open +name +email +createdAt
Author:Peter -_id -DeviceName
age>25 +name +score -_id
+name +email                    (projection only, no filter)
Name:/stefan/ +Name -State      (regex filter + projection)
```

Token classification:
- `+field` or `+dot.path` → projection include (`{ field: 1 }`)
- `-field` (bare, no `:` or operator) → projection exclude (`{ field: 0 }`)
- `-field:value` → still a filter negation (`$ne`) — existing behaviour preserved
- Everything else → filter token

### Parsing

`parseSimpleQueryFull(input)` returns `{ filter, projection }`:

- Iterates tokens; `+field` → projection include, bare `-field` → projection exclude
- All others → existing filter logic unchanged
- `parseSimpleQuery` wraps it for callers that only need the filter

### Integration points

- `src/query/parser.ts` — `parseSimpleQueryFull`, `projectionToSimple`
- `src/hooks/useDocumentLoader.ts` — uses `parseSimpleQueryFull` for both filter and projection
- `src/components/FilterBar.tsx` — colours `+field` tokens in secondary, bare `-field` in warning
- `src/components/FilterSuggestions.tsx` — detects `+`/`-` prefix on last token, suggests field names (no `:` suffix for projection tokens)
- `src/state.ts` — BSON migration uses `parseSimpleQueryFull`; back-migration emits `+`/`-` tokens

### No new state fields

Projection is encoded directly in `queryInput`. Tab persistence, undo-close, clone-tab, and clear all work for free.

## File Structure

| File | Change |
|------|--------|
| `src/query/parser.ts` | Add `splitProjection()`, `parseProjection()`, update `parseSimpleQuery()` to return `{ filter, projection }` |
| `src/hooks/useDocumentLoader.ts` | Pass projection from parsed query to `fetchDocuments` |
| `src/components/FilterBar.tsx` | Render `|` delimiter and projection tokens; update badge |
| `src/components/FilterSuggestions.tsx` | Detect cursor position relative to `|`; show field suggestions on projection side |
| `src/query/types.ts` | Add `ParsedSimpleQuery` type with `filter` and `projection` fields |
