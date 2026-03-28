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
- Query history with up/down arrows (P3)
- Projection field validation against schema (P3)
- Visual diff of active vs. previous filter (P3)

## Description

A dual-mode query bar for filtering documents. Simple mode uses human-readable `Key:Value`
syntax that auto-converts to MongoDB queries. BSON mode is an expanding multi-section panel
that exposes filter, sort, and projection as raw MongoDB JSON — and is designed to grow into
full aggregation pipeline support in the future.

## Out of Scope

- Aggregation pipelines (planned, see Future section below)
- Query history / saved queries (future spec)
- Index-aware query suggestions
- Live / debounced results (submit on Enter only)

## Capabilities

### P1 - Must Have (all done)

- **Simple mode** (default): single-line `<input>` at the bottom of the screen — **done**
  - Parse `Key:Value` pairs into MongoDB filters
  - `Author:Peter` → `{ "Author": "Peter" }`
  - `Author:Peter State:Closed` → `{ "Author": "Peter", "State": "Closed" }`
  - Comparison operators: `age>25`, `age>=25`, `age<25`, `count!=0`
  - Regex: `name:/^john/i` → `{ "name": { "$regex": "^john", "$options": "i" } }`
  - Negation: `-Field:Value` → `{ "Field": { "$ne": "Value" } }`
  - Dot-notation: `address.city:London` → `{ "address.city": "London" }`
  - Null / exists checks: `email:null`, `email:exists`, `email:!exists`
  - `$elemMatch` auto-generated for array ancestors
  - Field name suggestions with dot-notation drill-down (schema-aware)
  - Execute on Enter, clear with Backspace (outside bar), open with `/`

- **BSON mode**: expanding multi-section panel, toggled with `Tab` from the filter bar — **done**
  - **Filter section** (always visible): raw MongoDB filter JSON textarea
  - **Sort section** (toggle with `Ctrl+O`): raw MongoDB sort JSON textarea
  - **Projection section** (toggle with `Ctrl+J`): raw MongoDB projection JSON textarea
  - `Tab` cycles focus between visible sections
  - `Ctrl+F` pretty-prints (formats) the currently focused section
  - `Enter` submits all sections
  - `Escape` closes the BSON panel (returns to simple mode display)
  - Mode badge: `[Simple]` in green / `[BSON]` in orange — always visible when bar is open

- **Mode migration on Tab switch** — **done**:
  - Simple → BSON: current simple query is parsed and pre-populated as pretty-printed JSON
    in the filter textarea; active sort state is pre-populated in the sort textarea
  - BSON → Simple: filter textarea content is carried back into the simple input as-is
    (user's raw JSON is preserved as the query string)

### P2 - Should Have

- Filter-from-value: press `f` on a cell to append `field:value` to the simple query — **done** (see spec 016)
- Show current mode indicator in the filter bar at all times (even when closed, if a
  query is active) — **done** (mode badge always visible in filter bar)
- Syntax highlighting in BSON textareas (JSON language) — **not done**
- BSON parse error shown inline (red message below the offending textarea) rather than
  silently falling back to unfiltered — **not done**

### P3 - Nice to Have

- Query history with up/down arrows (simple mode) — **not done**
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
