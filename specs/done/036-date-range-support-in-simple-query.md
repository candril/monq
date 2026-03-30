# Date & Range Support in Simple Query Bar

**Status**: Done

## Description

The simple query bar treats date-like strings as plain strings, so `createdAt>2025-01-01`
produces a string comparison instead of a proper MongoDB `$gt: Date(...)` filter.
This spec adds date parsing to `coerceValue`, number range shorthand (`field:N..M`),
bidirectional round-trip support in `filterToSimple`, and correct EJSON serialisation
when switching to BSON mode.

## Out of Scope

- Timezone-aware display (all dates are treated as UTC)
- Date support in BSON mode (already works via `{ "$date": "..." }`)
- Date picker UI / calendar widget
- String range shorthand (alphabetical ordering is rarely useful in practice)

---

## Capabilities

### P1 — Must Have

- `coerceValue` recognises ISO 8601 date strings and returns a JS `Date` object:
  - Full date-time: `2025-01-01T00:00:00Z`, `2025-01-01T15:30:00.000Z`
  - Date-only shorthand: `2025-01-01` (treated as `2025-01-01T00:00:00.000Z`)
- All comparison operators work with dates:
  - `createdAt>2025-01-01` → `{ createdAt: { $gt: ISODate("2025-01-01T00:00:00.000Z") } }`
  - `createdAt>=2025-01-01` → `{ createdAt: { $gte: ... } }`
  - `createdAt<2025-12-31` → `{ createdAt: { $lt: ... } }`
  - `createdAt<=2025-12-31` → `{ createdAt: { $lte: ... } }`
  - `createdAt:2025-01-01` → `{ createdAt: ISODate("2025-01-01T00:00:00.000Z") }` (exact match)
  - `createdAt!=2025-01-01` → `{ createdAt: { $ne: ISODate(...) } }`
  - `-createdAt:2025-01-01` → `{ createdAt: { $ne: ISODate(...) } }`
- `filterToSimple` round-trips `Date` values back to `YYYY-MM-DD` shorthand when the
  time component is midnight UTC, and to full ISO string otherwise
- `simpleToBson` serialises `Date` values correctly as `{ "$date": "..." }` so that
  simple → BSON mode migration shows valid Extended JSON

### P2 — Should Have

- **Number range shorthand**: `field:N..M` expands to `{ field: { $gte: N, $lte: M } }`
  - Either bound can be omitted: `field:..M` → `{ $lte: M }`, `field:N..` → `{ $gte: N }`
  - Both bounds are coerced via `coerceValue` so they become proper numbers
  - `filterToSimple` collapses a `{ $gte: N, $lte: M }` pair back to `field:N..M` when
    both values are numbers (and neither bound is missing)
  - Examples: `age:18..65`, `price:10..50.99`, `score:..100`

- **Date range shorthand**: `createdAt:2025-01-01..2025-12-31` expands to
  `{ createdAt: { $gte: Date("2025-01-01T00:00:00Z"), $lte: Date("2025-12-31T23:59:59.999Z") }}`
  (end of day for the upper bound when the right side is a date-only string)
- Either or both sides of a range can be a relative expression:
  - `createdAt:ago(3d)..now` → last 3 days up to this instant
  - `createdAt:ago(1m)..today` → last month up to start of today
  - `createdAt:2025-01-01..today` → absolute lower bound, relative upper bound
  - The two sides are coerced independently via `coerceValue`, so any mix of ISO
    date, ISO datetime, or relative expression is valid
- Relative date expressions evaluated at query time (always UTC):
  - `now` — current instant (`new Date()`)
  - `today` — start of current UTC day (`YYYY-MM-DDT00:00:00.000Z`)
  - `ago(Nd)` — `N` days ago, e.g. `ago(7d)` = 7 days before now
  - `ago(Nw)` — `N` weeks ago, e.g. `ago(2w)`
  - `ago(Nm)` — `N` months ago (calendar months, same day-of-month)
  - `ago(Nh)` — `N` hours ago
  - `in(Nd)` — `N` days from now (future)
  - `in(Nw)` — `N` weeks from now
  - `in(Nm)` — `N` months from now
  - `in(Nh)` — `N` hours from now
  - Examples: `createdAt>ago(7d)`, `expiresAt<in(7d)`, `scheduledAt:now..in(1w)`, `ts>=today`
  - These are **not** round-tripped by `filterToSimple` — the resolved `Date` value is
    serialised to ISO string on the way back, since the original expression cannot be
    recovered from the filter object
- Schema-aware coercion: when a `SchemaMap` is provided and the field is typed `"date"`,
  even unambiguous numeric-looking strings that would normally be coerced to numbers are
  tried as dates first (edge case: fields named e.g. `year` with values like `20250101`)
- Filter bar hint text is updated to show the date syntax:
  `field:value field>date field>ago(7d) field:date1..date2 …`

### P3 — Nice to Have

- Inline token highlighting: date tokens in the inactive filter bar display are coloured
  distinctly (e.g. `theme.secondary`) so users can confirm the value was parsed as a date
- Autocomplete suggestion appends `>` operator when the cursor is on a known `"date"` field

---

## Technical Notes

### Date detection heuristic

A string is treated as a date if it matches either pattern:

```
/^\d{4}-\d{2}-\d{2}$/                          // YYYY-MM-DD
/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/   // ISO 8601 datetime
```

Using a regex first (not `new Date(str)`) avoids false-positives like `"123"` or
`"Infinity"` which JS coerces to valid dates. Only strings that match the patterns above
are converted; everything else falls through to existing coercion.

```typescript
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z?$/

function coerceValue(raw: string, fieldType?: FieldType): string | number | boolean | null | Date | ObjectId | RegExp {
  // ... existing checks ...

  if (DATE_ONLY.test(raw)) return new Date(raw + "T00:00:00.000Z")
  if (DATE_TIME.test(raw)) return new Date(raw)

  // ... rest of coercion ...
}
```

The optional `fieldType` parameter (from `SchemaMap`) is used for P2 schema-aware coercion.

### `filterToSimple` round-trip

`filterToSimple` already handles `$gt`, `$gte`, `$lt`, `$lte`. It needs to serialise
`Date` objects back to strings:

```typescript
function serializeValue(v: unknown): string {
  if (v instanceof Date) {
    // Prefer YYYY-MM-DD shorthand when time is midnight UTC
    if (v.getUTCHours() === 0 && v.getUTCMinutes() === 0 && v.getUTCSeconds() === 0 && v.getUTCMilliseconds() === 0) {
      return v.toISOString().slice(0, 10) // "2025-01-01"
    }
    return v.toISOString() // full ISO
  }
  // ... existing cases ...
}
```

### `simpleToBson` — Extended JSON output

When `simple → BSON` mode migration serialises the filter for the BSON textarea,
`Date` instances must become Extended JSON so they remain valid MongoDB query syntax:

```typescript
// Before (broken for dates):
JSON.stringify(filter, null, 2)

// After:
import { EJSON } from "bson"
EJSON.stringify(filter, { relaxed: false }, 2)
```

`EJSON` is already available in the project via the `bson` package (used in
`providers/mongodb.ts`). The `relaxed: false` option emits `{ "$date": { "$numberLong": "..." } }`
form which MongoDB's driver round-trips correctly.

### Range shorthand (P2)

The tokeniser already splits on whitespace. The `..` range operator is parsed inside the
`:` value branch. The same syntax handles both number and date ranges:

```
field:v1..v2
          ↓
{ field: { $gte: coerce(v1), $lte: coerce(v2) } }     (numbers)
{ field: { $gte: coerce(v1), $lte: endOfDay(v2) } }   (dates, right side gets end-of-day)
```

Either bound may be omitted: `field:..M` → `{ $lte: M }`, `field:N..` → `{ $gte: N }`.

`endOfDay(d: Date)` sets the time to `23:59:59.999Z` only when `v2` was a date-only
string (no time component); full datetime strings are used verbatim.

`filterToSimple` collapses a `{ $gte: x, $lte: y }` pair back to `field:x..y` when:
- Both values are numbers, **or**
- Both values are `Date` objects and the lower bound is start-of-day / upper bound is end-of-day.

### Relative date expressions (P2)

Resolved inside `coerceValue` before the ISO regex check. The grammar is intentionally
small to keep it easy to type at a terminal:

```
now          →  new Date()
today        →  start of current UTC day
ago(Nd)      →  now minus N days
ago(Nw)      →  now minus N*7 days
ago(Nm)      →  now minus N calendar months
ago(Nh)      →  now minus N hours
```

Implementation sketch:

```typescript
const RELATIVE = /^(now|today|(ago|in)\((\d+)(d|w|m|h)\))$/

function coerceRelativeDate(raw: string): Date | null {
  const m = RELATIVE.exec(raw)
  if (!m) return null
  const now = new Date()
  if (raw === "now") return now
  if (raw === "today") return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const direction = m[2] === "ago" ? -1 : 1
  const n = parseInt(m[3], 10)
  const unit = m[4]
  switch (unit) {
    case "h": return new Date(now.getTime() + direction * n * 3_600_000)
    case "d": return new Date(now.getTime() + direction * n * 86_400_000)
    case "w": return new Date(now.getTime() + direction * n * 7 * 86_400_000)
    case "m": {
      const d = new Date(now)
      d.setUTCMonth(d.getUTCMonth() + direction * n)
      return d
    }
  }
  return null
}
```

The relative check runs before the ISO regex check in `coerceValue`.

### Test cases to add (`parser.test.ts`)

| Input | Expected filter |
|-------|----------------|
| `age:18..65` (P2) | `{ age: { $gte: 18, $lte: 65 } }` |
| `age:..65` (P2) | `{ age: { $lte: 65 } }` |
| `age:18..` (P2) | `{ age: { $gte: 18 } }` |
| Round-trip: `filterToSimple({ age: { $gte: 18, $lte: 65 } })` (P2) | `"age:18..65"` |
| `createdAt>2025-01-01` | `{ createdAt: { $gt: new Date("2025-01-01T00:00:00.000Z") } }` |
| `createdAt>=2025-01-01T12:00:00Z` | `{ createdAt: { $gte: new Date("2025-01-01T12:00:00.000Z") } }` |
| `createdAt<2025-12-31` | `{ createdAt: { $lt: new Date("2025-12-31T00:00:00.000Z") } }` |
| `createdAt:2025-06-15` | `{ createdAt: new Date("2025-06-15T00:00:00.000Z") }` |
| `createdAt!=2025-06-15` | `{ createdAt: { $ne: new Date("2025-06-15T00:00:00.000Z") } }` |
| `createdAt:2025-01-01..2025-12-31` (P2) | `{ createdAt: { $gte: Date("2025-01-01T00:00:00Z"), $lte: Date("2025-12-31T23:59:59.999Z") } }` |
| Round-trip: `filterToSimple({ createdAt: { $gt: new Date("2025-01-01T00:00:00.000Z") } })` | `"createdAt>2025-01-01"` |
| Round-trip: full ISO | `"createdAt>2025-01-01T15:30:00.000Z"` |
| `createdAt>now` (P2) | `{ createdAt: { $gt: <Date ~= Date.now()> } }` |
| `createdAt>today` (P2) | `{ createdAt: { $gt: <start of today UTC> } }` |
| `createdAt>ago(7d)` (P2) | `{ createdAt: { $gt: <now minus 7 days> } }` |
| `createdAt>ago(2w)` (P2) | `{ createdAt: { $gt: <now minus 14 days> } }` |
| `createdAt>ago(1m)` (P2) | `{ createdAt: { $gt: <now minus 1 calendar month> } }` |
| `createdAt>ago(6h)` (P2) | `{ createdAt: { $gt: <now minus 6 hours> } }` |
| `expiresAt<in(7d)` (P2) | `{ expiresAt: { $lt: <now plus 7 days> } }` |
| `scheduledAt:now..in(1w)` (P2) | `{ scheduledAt: { $gte: <now>, $lte: <now plus 7 days> } }` |
| `expiresAt:in(1m)` (P2) | `{ expiresAt: <now plus 1 calendar month> }` |

---

## File Structure

**Modified files:**
```
src/query/parser.ts           # coerceValue: date + relative date detection; filterToSimple: Date/number serialization; range shorthand N..M (P2)
src/query/parser.test.ts      # new date and number range test cases (table above)
src/state.ts                  # simpleToBson migration: use EJSON.stringify instead of JSON.stringify
```
