# Simple Mode Projection

**Status**: Done

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

- Inline `+field` / bare `-field` tokens in `queryInput` (no `|` separator — inline classification only)
- `+field` or `+field.nested` → include (`{ field: 1 }`)
- `-field` prefix (bare, no `:` or operator) → exclude (`{ field: 0 }`)
- `-field:value` still routes to filter negation (`$ne`) — existing behaviour preserved
- Pass parsed projection to `fetchDocuments` as the `projection` option
- Colour-differentiated token display in filter bar: `+field` in secondary, bare `-field` in warning
- Backspace / clear filter also clears projection (implicit — projection is encoded in `queryInput`)

### P2 - Should Have

- Field autocomplete on the projection side (same schema-aware suggestions; completion suffix is a space not `:`) — **done**
- Migrate projection to BSON mode: when switching simple → BSON, populate the projection textarea — **done**
- Migrate back: when switching BSON → simple, carry projection back if it is a flat inclusion/exclusion map — **done**
- Syntax error feedback if projection token is invalid — **not done** (invalid tokens are silently discarded)

### P3 - Nice to Have

- Highlight projected columns in the document table header — **not done**
- `query:toggle-projection` command palette entry to quickly clear projection — **not done**
  - A per-column `view:toggle-column-exclude` command exists (adds/removes `+`/`-` tokens per field)

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

`parseSimpleQueryFull(input)` returns `{ filter, projection }` (`ParsedSimpleQuery` type).

- Classification is inlined in `parseSimpleQueryFull` — no separate `splitProjection()` or `parseProjection()` functions.
- `parseSimpleQuery` wraps it for callers that only need the filter.
- `ParsedSimpleQuery` is exported from `src/query/parser.ts` (not a separate `src/query/types.ts`).

### `_id` safety

`sanitizeProjection()` in `useDocumentLoader.ts` strips `_id: 0` before the MongoDB call so
edit/delete can still locate documents by `_id`. When `_id` is excluded, `idHidden = true`
is set to hide the column visually.

### BSON migration

- `simpleToBson()` (`parser.ts`) extracts projection from `parseSimpleQueryFull` and populates `bsonProjection` as pretty-printed JSON.
- `bsonToSimple()` (`parser.ts`) converts a flat `{ field: 0|1 }` projection back to `+`/`-` tokens. Non-0/1 values are silently dropped (lossless-only carry-back).

### No new state fields

Projection is encoded directly in `queryInput`. Tab persistence, undo-close, clone-tab, and clear all work for free.

## File Structure

| File | Change |
|------|--------|
| `src/query/parser.ts` | `parseSimpleQueryFull()` with inline token classification; `ParsedSimpleQuery` type; `simpleToBson()` / `bsonToSimple()` migration helpers; `projectionToSimple()` |
| `src/hooks/useDocumentLoader.ts` | Passes projection from `parseSimpleQueryFull` (simple mode) or `bsonProjection` (BSON mode) to `fetchDocuments`; `sanitizeProjection()` strips `_id:0` |
| `src/components/FilterBar.tsx` | Colours `+field` tokens in secondary, bare `-field` in warning when not editing |
| `src/components/FilterSuggestions.tsx` | Detects `+`/`-` prefix on last token; completes with space suffix (not `:`) for projection tokens |
| `src/state.ts` | `TOGGLE_QUERY_MODE` and `OPEN_QUERY_BSON` use `simpleToBson()`/`bsonToSimple()` for projection migration |
