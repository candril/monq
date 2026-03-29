# Query Bar

**Status**: In Progress

## What's Done

- Simple mode `<input>` with all P1 parsing (Key:Value, comparison ops, regex, negation, dot-notation, null/exists, `$elemMatch`)
- BSON mode expanding multi-section panel (filter + sort + projection textareas)
- Mode badge `[Simple]` / `[BSON]` in filter bar
- Mode migration: simple → BSON (pre-populate filter + sort); BSON → simple (carry back filter)
- `Tab` key cycles BSON sections; `Ctrl+F` formats; `Enter` submits; `Escape` closes
- `filterToSimple()` reverse-translation for pipeline-to-simple conversion
- `OPEN_QUERY_BSON` action opens bar directly in BSON mode with migration from current state
- Filter-from-value (`f` key) appends `field:value` to simple query — **done** (see spec 016)
- Field suggestions popup (`FilterSuggestions.tsx`) — **done** (see spec 015)

## What's Missing

- Syntax highlighting in BSON textareas (P2)
- Inline BSON parse error display (P2) — errors currently silently fall back to unfiltered fetch
- Query history picker — **done**
  - `Ctrl-Y` while simple bar is open shows history overlay above the input
  - `Ctrl-P` / `Ctrl-N` to navigate entries, `Enter` to pick, `Escape` or `Ctrl-Y` to dismiss
  - Picking a history entry sets the input and submits immediately
  - Persisted to `$XDG_DATA_HOME/monq/history` (default `~/.local/share/monq/history`)
  - Deduplicates entries; capped at 100; loaded at startup and updated in-session
  - Field suggestions are suppressed while the history picker is open
- Validate projection fields against known schema — **not done**
- Visual diff of active filter vs. previous filter — **not done**

## Technical Notes

### Simple Query Parser

Located at `src/query/parser.ts`. Key exports:

```typescript
parseSimpleQuery(input: string, schemaMap?: SchemaMap): Filter<Document>
parseBsonQuery(input: string): Filter<Document>
getLastToken(input: string): { prefix: string; lastToken: string }
```

### Mode Toggle State Migration

When switching **simple → BSON**, the reducer:
1. Calls `parseSimpleQuery(queryInput)` to get the current filter object
2. Pretty-prints it as `JSON.stringify(filter, null, 2)` → `bsonFilter` textarea
3. If `sortField` is set, converts `{ [sortField]: sortDirection }` → `bsonSort` textarea
4. Clears `sortField` / `sortDirection` (BSON mode owns sort now)

When switching **BSON → simple**:
1. Carries the raw `bsonFilter` string back into `queryInput`
2. Clears `bsonSort` / `bsonProjection`

### BSON Editor Layout

Expands in-place at the bottom of the screen. Height grows as sections are added:

```
─────────────────────────────────────────────────────────────────────
[BSON]  Tab cycle · Ctrl+F format · Ctrl+O sort · Ctrl+J project · ↵ submit
filter ▸
┌──────────────────────────────────────────────────────────────────┐
│ {                                                                │
│   "age": { "$gt": 25 }                                          │
│ }                                                                │
└──────────────────────────────────────────────────────────────────┘
sort  (after Ctrl+O)
┌──────────────────────────────────────────────────────────────────┐
│ { "age": -1 }                                                    │
└──────────────────────────────────────────────────────────────────┘
─────────────────────────────────────────────────────────────────────
```

Section labels dim when unfocused; active section label shows `▸` indicator.

### fetchDocuments Options

`src/providers/mongodb.ts` `fetchDocuments()` accepts:

```typescript
options: {
  skip?: number
  limit?: number
  sort?: Record<string, 1 | -1>     // used by both simple sort and bsonSort
  projection?: Record<string, 0 | 1> // new — passed from bsonProjection
}
```

### AppState BSON Fields

```typescript
bsonFilter: string          // filter textarea content (mirrors queryInput in bson mode)
bsonSort: string            // sort textarea content
bsonProjection: string      // projection textarea content
bsonFocusedSection: "filter" | "sort" | "projection"
bsonSortVisible: boolean
bsonProjectionVisible: boolean
```

Note: in BSON mode `queryInput` is kept in sync with `bsonFilter` so that the rest of
the app (document loader, tab persistence, filter bar display) can remain agnostic of mode.

## Future: Aggregation Pipeline

The BSON editor is intentionally designed to extend into aggregation pipeline support.
The planned addition is a **Pipeline section** (`Ctrl+A` to toggle), where the user enters
a JSON array of pipeline stages:

```json
[
  { "$match": { "status": "active" } },
  { "$group": { "_id": "$category", "count": { "$sum": 1 } } },
  { "$sort": { "count": -1 } }
]
```

When a pipeline is present it takes precedence over filter/sort/projection (which become
disabled). The document loader would call `collection.aggregate(pipeline)` instead of
`collection.find(filter)`.

This is **out of scope for the current implementation** and will be tracked in a dedicated
spec (e.g. `012-aggregation-pipeline.md`).

## File Structure

### Modified
- `src/specs/004-query-bar.md` — this file
- `src/types.ts` — add `BsonSection`, BSON fields to `AppState` and `Tab`
- `src/state.ts` — add BSON actions + reducer cases, state migration on mode toggle
- `src/components/FilterBar.tsx` — rewrite: expanding panel, mode badge, textareas
- `src/components/FilterSuggestions.tsx` — hide when in BSON mode
- `src/hooks/useKeyboardNav.ts` — Tab toggle, Ctrl+O/J/F, section cycling
- `src/hooks/useDocumentLoader.ts` — pass sort + projection from BSON fields
- `src/providers/mongodb.ts` — add `projection` option to `fetchDocuments`
- `src/App.tsx` — pass BSON fields to FilterBar

### Already Exists
- `src/query/parser.ts` — simple + BSON query parsers
- `src/query/schema.ts` — schema map for suggestions
