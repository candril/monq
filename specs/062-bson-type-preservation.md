# 062 — BSON Type Preservation on Edit

**Status**: In Progress

## Description

Editing a document must never silently change a field's BSON type. Today, editing
a document that contains a `Long` (Int64) field can rewrite that field as `Int32`
(or `Double`), corrupting the data on disk — even when the user never touched that
field. This spec fixes the type loss and unifies the JSON format used by every
write path so all editors round-trip documents identically.

### The bug

Reproduction: a collection has `{ count: Long(5) }`. Open the document in the
editor (`Ctrl+E` tmux split or bulk edit), change any *other* field, save. The
`count` field is now stored as `Int32(5)`. Large `Long` values additionally lose
*value* precision (e.g. `9007199254740993` → `9007199254740992`).

### Root cause (two layers)

1. **Read side — type lost before editing.** The driver is created with default
   BSON options (`src/providers/mongodb.ts`), i.e. `promoteValues: true` and
   `promoteLongs: true`. The driver therefore returns `Int32`, `Double`, and
   `Long` values that fit in 53 bits as plain JS `number`s. The in-memory
   document has already lost the distinction between `Long(5)`, `Int32(5)`, and
   `Double(5)` before any serialization happens.

2. **Round-trip side — relaxed EJSON is lossy.** Every edit/write path serializes
   documents with **relaxed** EJSON (`EJSON.stringify(..., { relaxed: true })`),
   which renders `Int32`/`Long`/`Double` as bare JSON numbers with no type tag.
   On save the text is parsed (`JSON5.parse` → `EJSON.deserialize`), producing a
   plain JS `number`, and the driver re-guesses the BSON type on write
   (integer in int32 range → `Int32`). So a write of a bare number always
   collapses to `Int32`/`Double`.

Because type info is gone at *read* time, no purely client-side reconciliation
can recover it. The fix must re-read the affected documents with BSON promotion
disabled, then preserve those types across the edit round-trip.

### Current serialization inventory (for reference)

| Path | Serialize | Parse | Format |
|---|---|---|---|
| Single-doc edit | `serializeDocumentRelaxed` (`documentPreviewSplit.ts:104`) | `EJSON.deserialize(JSON5.parse)` (`:297`) | relaxed |
| Edit-many | `EJSON.stringify(relaxed)` (`editMany.ts:149`) | `EJSON.deserialize(JSON5.parse)` (`:167`) | relaxed |
| Edit-many diff | `EJSON.stringify(relaxed)` (`editMany.ts:212`) | — | relaxed |
| Query-update template | `serializeDocumentRelaxed` (`queryUpdate.ts:326,466`) | `EJSON.deserialize` (`:272,502`) | relaxed |
| Pipeline template | `EJSON.stringify` default (`pipeline.ts:112,144`) | `EJSON.deserialize` (`:512`) | relaxed (implicit) |
| Yank to clipboard | `serializeDocument` **canonical** (`yank.ts:18`) | — | canonical |

Note the inconsistency: yank copies canonical, the editors use relaxed.

## Out of Scope

- **Global promotion change.** We do *not* flip the driver-wide `promoteValues` /
  `promoteLongs`. That would force every number in the app to become a BSON
  wrapper and ripple through display, counts, sampling, and coercion. The fix is
  targeted to the edit/write flows.
- **New documents (insert) and `$set` literals in query-update / pipeline.** A
  brand-new document or an arbitrary update expression has no source value to
  reconcile against. Authors who need a specific numeric type there use explicit
  extended JSON (`{ "$numberLong": "5" }`), which is honored. These paths only
  get the unified *format*, not reconciliation.
- **Choosing a typed editor UI** (like Compass). We keep the readable
  relaxed-EJSON text editor.

## Capabilities

### P1 — Stop type corruption on document replace (the bug)

- `reconcileTypes(edited, original)` — pure function that walks an edited value
  alongside its raw original and restores lost numeric BSON types.
- `fetchRawDocuments(collectionName, filter, options)` — reads documents with
  `promoteValues: false` and `promoteLongs: false`, so originals carry true
  BSON types.
- Single-doc preview save (`documentPreviewSplit.ts`): on save, re-fetch the raw
  original by `_id`, reconcile the edited doc against it, use the raw original for
  the no-change comparison, then `replaceOne` with the reconciled doc.
- Edit-many save (`editMany.ts`): re-fetch raw originals by `{ _id: { $in } }`,
  reconcile each edited doc against its raw original, diff with type-aware
  (canonical) comparison, `replaceOne` reconciled docs.

### P2 — Unify the write/edit JSON format

- Single shared `serializeForEdit` / `serializeForEditArray` (relaxed EJSON,
  2-space indent) used by every document editor buffer: single-doc, edit-many,
  query-update template, pipeline template.
- Edit-many change detection uses canonical EJSON so a pure type change is
  detected as a change (not a false "unchanged").

### P3 — Tests & docs

- Comprehensive unit tests for `reconcileTypes` (see Technical Notes).
- Update `docs/` / `README` notes on type handling if relevant.

## Technical Notes

### `reconcileTypes(edited, original)`

New focused module `src/utils/bsonReconcile.ts`. Pure, no DB/driver calls.

Walk `edited` alongside `original`:

- **edited is a plain number** and original is a BSON numeric wrapper:
  - original `Long`:
    - integer & equals `original.toNumber()` → return `original` verbatim
      (preserves exact big-int value and the `Long` type).
    - integer & changed → `Long.fromNumber(edited)`.
    - non-integer → `new Double(edited)` (cannot be `Long`).
  - original `Int32`: integer → `new Int32(edited)`; non-integer → `new Double(edited)`.
  - original `Double`: `new Double(edited)` (keep `Double` even for integer values).
  - original `Decimal128`: `Decimal128.fromString(String(edited))`.
  - original is a plain number / non-numeric: leave `edited` as-is.
- **edited is already a BSON wrapper** (user wrote explicit `{ "$numberLong": .. }`):
  honor it, return `edited` unchanged.
- **edited is an array**: reconcile element-wise against `original[i]` (index-aligned;
  elements without a matching original are left as-is).
- **edited is a plain object**: recurse per key against `original[key]`; keys not
  present in original are left as-is. Do *not* recurse into BSON wrappers, `Date`,
  `ObjectId`.
- **everything else** (string, boolean, null, `Date`, `ObjectId`): return as-is.

BSON detection via `_bsontype` and the `bson` constructors (`Long`, `Int32`,
`Double`, `Decimal128`).

### Read side

```ts
// src/providers/mongodb.ts
export async function fetchRawDocuments(
  collectionName: string,
  filter: Filter<Document>,
  options: { limit?: number } = {},
): Promise<Document[]> {
  const cursor = getDb()
    .collection(collectionName)
    .find(filter, { promoteValues: false, promoteLongs: false })
  if (options.limit) cursor.limit(options.limit)
  return cursor.toArray()
}
```

`FindOptions` extends `BSONSerializeOptions`, so per-query promotion control is
supported by the driver (v6).

### Save flow (single-doc)

1. Parse edited text → `editedDoc`.
2. `[raw] = fetchRawDocuments(coll, { _id }, { limit: 1 })`.
3. `typed = reconcileTypes(editedDoc, raw)`.
4. If `canonicalEjson(rawFields) === canonicalEjson(typedFields)` → no write.
5. `replaceDocument(coll, raw._id, typedFields)`.

### Unified format

`serializeForEdit(doc)` / `serializeForEditArray(docs)` in `src/utils/document.ts`
wrap `EJSON.stringify(value, undefined, 2, { relaxed: true })`. All editor buffers
import these. Yank (a read/copy, not a write) keeps lossless canonical EJSON and
is explicitly out of the "write format" unification.

### Test plan (`src/utils/bsonReconcile.test.ts`)

- Untouched `Long(5)` survives as `Long(5)` (not `Int32`).
- Untouched big `Long` survives with exact value and type.
- Changed `Long` → still `Long` with new value.
- `Long` changed to a fractional value → `Double`.
- Untouched / changed `Int32` stays `Int32`.
- `Double(5)` (integer-valued) stays `Double`, not `Int32`.
- `Decimal128` preserved.
- Nested objects and arrays of mixed numeric types.
- New fields with no original left untouched.
- Explicit user EJSON wrapper in edited honored over original type.
- Non-numeric originals (string/`ObjectId`/`Date`/`null`/boolean) untouched.
- Full round-trip: `serializeForEdit` → parse → `reconcileTypes` preserves types.
