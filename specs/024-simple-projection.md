# Simple Mode Projection

**Status**: Draft

## Description

Extend the simple filter bar with a projection clause using a pipe (`|`) separator.
Everything before `|` is the existing filter; everything after is a space-separated list
of field paths to include or exclude. Dot-notation is supported for nested fields.
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

```
<filter-tokens> | <projection-tokens>
```

Examples:

```
Author:Peter State:Open | name email createdAt
Author:Peter            | address.city address.zip
age>25                  | -_id name score
                        | name email          (projection only, no filter)
```

Projection token rules:
- `field` or `dot.path` → `{ field: 1 }`
- `-field` or `-dot.path` → `{ field: 0 }`
- Mixed inclusion/exclusion follows standard MongoDB rules (only `_id` can be excluded alongside inclusions)

### Parsing

Split `queryInput` on the first `|`:

```ts
function splitProjection(input: string): { filter: string; projection: string } {
  const idx = input.indexOf("|")
  if (idx === -1) return { filter: input.trim(), projection: "" }
  return { filter: input.slice(0, idx).trim(), projection: input.slice(idx + 1).trim() }
}

function parseProjection(projection: string): Record<string, 0 | 1> {
  const result: Record<string, 0 | 1> = {}
  for (const token of projection.trim().split(/\s+/)) {
    if (!token) continue
    if (token.startsWith("-")) result[token.slice(1)] = 0
    else result[token] = 1
  }
  return result
}
```

### Integration points

- `src/query/parser.ts` — `parseSimpleQuery(input)` should call `splitProjection` first, parse only the filter half, and return projection separately
- `src/hooks/useDocumentLoader.ts` — pass parsed projection to `fetchDocuments`
- `src/components/FilterBar.tsx` — render projection tokens after the pipe visually; show projection count in badge
- `src/components/FilterSuggestions.tsx` — extend to suggest fields when cursor is after `|`
- `src/state.ts` — no new state fields needed; projection lives inside `queryInput` as part of the string

### No new state fields

Projection is encoded directly in `queryInput` (e.g. `"Author:Peter | name email"`). This means:
- Tab persistence, undo-close, clone-tab all get projection for free
- BSON migration reads the projection out of the string before populating the textarea
- Clear query (`CLEAR_QUERY`) wipes both filter and projection in one action

## File Structure

| File | Change |
|------|--------|
| `src/query/parser.ts` | Add `splitProjection()`, `parseProjection()`, update `parseSimpleQuery()` to return `{ filter, projection }` |
| `src/hooks/useDocumentLoader.ts` | Pass projection from parsed query to `fetchDocuments` |
| `src/components/FilterBar.tsx` | Render `|` delimiter and projection tokens; update badge |
| `src/components/FilterSuggestions.tsx` | Detect cursor position relative to `|`; show field suggestions on projection side |
| `src/query/types.ts` | Add `ParsedSimpleQuery` type with `filter` and `projection` fields |
