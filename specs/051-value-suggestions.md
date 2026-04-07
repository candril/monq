# Value Suggestions and Quick-Filter Helpers

**Status**: In Progress

## Description

The suggestion panel currently only suggests field names. This spec extends it to also
suggest **values** — sampled from real documents in the current result set — and
**quick-filter helper expressions** (`ago()`, `in()`, `oid()`, `now`, `today`) when the
cursor is inside a value position (after the `:` or operator of a token).

The goal is to let users build filters entirely from the keyboard without remembering
exact ObjectId hex strings, relative date syntax, or the contents of enum-like fields.

## Out of Scope

- Suggestions in pipeline/BSON mode text areas
- Value suggestions for nested array elements
- Persisted suggestion history across sessions
- Fuzzy search within ObjectId hex values (exact prefix match only)

---

## Capabilities

### P1 — Must Have

#### Quick-filter helpers for typed fields

When the cursor is in a value position and the schema type for that field is known,
suggest context-relevant helper expressions:

- **`date` fields**: suggest `ago(7d)`, `ago(30d)`, `ago(1m)`, `ago(1y)`, `today`,
  `now` — plus the full range forms `>ago(7d)`, `>ago(30d)`, `:ago(7d)..today`
- **`objectId` / `_id` fields**: suggest `oid(<hex>)` stubs with the sampled ObjectId
  values from the current result set (see Value suggestions below)
- All field types: suggest `null` (empty/null check)

Hints in the suggestion panel show the type: `date`, `objectId`, `string`, etc.

#### Value suggestions from sampled documents

After a `:` or comparison operator, show values sampled from the current documents
for that field:

- Collect distinct values from all loaded documents for the current field path
  (deduplicated, capped at 20 distinct values)
- Display them as ready-to-accept suggestion entries
- For `ObjectId` values: display `oid(<hex>)` form (short and recognisable)
- For `Date` values: display ISO date shorthand `YYYY-MM-DD`
- For `string` values: quote with `"..."` only if the value contains spaces
- For `number` / `boolean` / `null`: render as-is

Accepting a value suggestion replaces the current partial value with the sampled value
and submits the query immediately (same behaviour as pressing Enter).

#### Suggestion panel context detection

The panel must detect whether the cursor is in a **field position** or **value position**:

- **Field position**: token has no `:` or operator → show existing field suggestions
  (current behaviour, unchanged)
- **Value position**: token contains `:` or `>`, `>=`, `<`, `<=`, `!=` → switch to
  value/helper suggestions

Triggered field name (left of operator) is used to look up the schema type and sample values.

### P2 — Should Have

#### Operator suggestions after field name

After a field name is completed (e.g. `createdAt` with no operator yet), suggest the
available operators with descriptions:

| Suggestion | Description |
|---|---|
| `createdAt:` | exact match |
| `createdAt>` | greater than |
| `createdAt>=` | greater than or equal |
| `createdAt<` | less than |
| `createdAt<=` | less than or equal |
| `createdAt!=` | not equal |
| `createdAt:..` | range (fill in bounds) |

The field type from `schemaMap` narrows which operators are shown:
- `date` fields: all operators + range form
- `number` fields: all operators + range form
- `string`/`objectId`/`boolean`/`null` fields: `:` and `!=` only

#### `in()` helper for repeated values

For `string`, `number`, and `objectId` fields with multiple sampled values, offer an
`in(v1,v2,v3)` aggregate filter spanning the top sampled values as a single
suggestion at the top of the list.

The `in()` syntax must be supported by the parser:
`field:in(a,b,c)` → `{ field: { $in: [coerce(a), coerce(b), coerce(c)] } }`

Round-trip: `filterToSimple` serialises `{ $in: [...] }` back to `field:in(...)`.

### P3 — Nice to Have

- When a value suggestion is selected (highlighted but not yet accepted), show a
  count badge in the hint column: `3 docs` — i.e. how many loaded documents match
  that exact value (quick pre-filter feedback without running a new query)
- Fuzzy filter sampled string values as the user types a partial value after `:`

---

## Technical Notes

### Context detection in `buildSuggestions`

`getLastToken` already splits the query into `{ prefix, lastToken }`. Detecting value
position means checking whether `lastToken` contains an operator character after the
field name:

```typescript
const VALUE_OP = /^([^><!:]+)(>=|<=|!=|>|<|:)(.*)$/
const m = VALUE_OP.exec(lastToken)
if (m) {
  const [, field, op, partial] = m
  // value position — show value/helper suggestions for `field`
}
```

### Sampling values from documents

Documents are already available in app state as `state.documents`. A pure utility
function extracts distinct values for a dot-notation field path:

```typescript
function sampleValues(documents: Document[], fieldPath: string, max = 20): unknown[] {
  const seen = new Set<string>()
  const result: unknown[] = []
  for (const doc of documents) {
    const val = getNestedValue(doc, fieldPath)
    if (val === undefined) continue
    const key = String(val)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(val)
    }
    if (result.length >= max) break
  }
  return result
}
```

`getNestedValue` walks dot-notation paths (already exists or is trivial to add).

### Helper suggestions by type

```typescript
function buildHelperSuggestions(fieldType: FieldType, prefix: string): Suggestion[] {
  if (fieldType === "date") {
    return [
      { label: ">ago(7d)",        value: prefix + ">ago(7d)",        hint: "last 7 days" },
      { label: ">ago(30d)",       value: prefix + ">ago(30d)",       hint: "last 30 days" },
      { label: ">ago(1m)",        value: prefix + ">ago(1m)",        hint: "last month" },
      { label: ">ago(1y)",        value: prefix + ">ago(1y)",        hint: "last year" },
      { label: ":today",          value: prefix + ":today",          hint: "today" },
      { label: ":ago(7d)..today", value: prefix + ":ago(7d)..today", hint: "7-day range" },
    ]
  }
  return []
}
```

`prefix` is the reconstructed partial query up to (and including) the operator.

### Serialising `oid()` values

Sampled `ObjectId` values are rendered as `oid(<hex>)` in the suggestion label and
value string. `coerceValue` already handles `oid(...)` (from spec-037), so accepting
such a suggestion produces a correct `ObjectId` filter.

### `in()` parser extension (P2)

In `coerceValue` / `parseToken`, detect the `in(...)` form:

```typescript
const inMatch = value.match(/^in\((.+)\)$/)
if (inMatch) {
  const parts = inMatch[1].split(",").map((s) => coerceValue(s.trim(), fieldType))
  return { $in: parts }  // returned as a filter value, not a scalar
}
```

`filterToSimple` detects `{ $in: [...] }` and serialises back to `field:in(...)`.

### Documents prop threading

`FilterSuggestions` currently receives `columns` and `schemaMap`. It needs one more
prop: `documents: Document[]` (already in app state, passed down via the existing
component tree).

---

## File Structure

| File | Change |
|------|--------|
| `src/components/FilterSuggestions.tsx` | Add value-position detection; `buildValueSuggestions()`; helper suggestions; `documents` prop |
| `src/query/parser.ts` | `in(...)` parse/serialise support (P2); `serializeValue` for `$in` (P2) |
| `src/utils/document.ts` | `sampleValues()` + `getNestedValue()` utilities (new or extend existing) |
| `src/query/schema.ts` | Export `FieldType` for use in suggestion builder (already exported — verify) |

## Keyboard (unchanged)

| Key | Action |
|-----|--------|
| `Ctrl+Y` | Accept highlighted suggestion (replaces last token) |
| `Ctrl+N` / `↓` | Next suggestion |
| `Ctrl+P` / `↑` | Previous suggestion |
