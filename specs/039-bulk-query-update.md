# Bulk Query Update

**Status**: In Progress

## Description

Run a MongoDB `updateMany` against the active collection directly from the TUI. The user
edits a JSONC template in `$EDITOR` containing a `filter`, `update`, and optional `upsert`
flag. After saving, monq shows a confirm dialog with a matched-document count before
writing anything. Supports the full MongoDB update operator vocabulary including positional
array updates (`tags.$.status`).

## Out of Scope

- Aggregation pipeline updates (`updateMany` with pipeline-style update — use the pipeline editor)
- Per-document preview of what will change (use bulk edit for that)
- `arrayFilters` as a first-class template key (users can add them manually; positional `$` covers the common case)

## Capabilities

### P1 - Must Have

- `Ctrl+U` in document view opens `$EDITOR` with a JSONC template
- Template pre-populates `filter` from the active query bar state (simple or BSON)
- Template contains `update` (`{ "$set": {} }`) and `upsert: false`
- Schema sidecar (`update-schema.json`) written alongside the temp file; referenced via `$schema` key
- Schema covers all common update operators with descriptions; `$set` / `$unset` / `$inc` etc. property keys documented to support dot-notation and the positional operator (`array.$.field`)
- Filter side of the schema is derived from `schemaMap` (field name completions)
- On save: parse JSONC, run `countDocuments(filter)` to get match count
- Resume TUI → confirm dialog showing filter summary, update summary, match count
- Dialog options: **apply** (`a`) / **cancel** (`c`) / `Escape`
- On apply: `updateMany(collection, filter, update, { upsert })` → toast with matched + modified counts
- Reload documents after apply
- Parse error reopens editor with inline `// !! PARSE ERROR:` comment (same retry loop as bulk edit)

### P2 - Should Have

- Comment hint in template when `upsert: true` mentioning `$setOnInsert`
- `doc:bulk-query-update` command palette entry ("Bulk Update (query)")

### P3 - Nice to Have

- `arrayFilters` as an optional top-level key (passed through to `updateMany` if present)

## Technical Notes

### JSONC Template

```jsonc
// Monq — bulk update · collection @ db
// Edit "update", then save (:wq) to preview and confirm. Quit without saving (:q!) to cancel.
//
// Operators: $set $unset $inc $push $pull $addToSet $rename $min $max $mul $currentDate $setOnInsert
// Positional: use "array.$.field" in $set/$unset to update the element matched by $elemMatch in filter
//
{
  "$schema": "/tmp/monq/{collection}/update-schema.json",
  "filter": { /* active filter */ },
  "update": { "$set": {} },
  "upsert": false
}
```

When `upsert` is changed to `true` by the user, the comment already mentions `$setOnInsert`
so power users know it's available — no dynamic template mutation needed.

### JSON Schema (`update-schema.json`)

Top-level object schema with four keys:

| Key | Type | Description |
|-----|------|-------------|
| `filter` | `object` | MongoDB filter — `additionalProperties` with field name `$defs` from `schemaMap` |
| `update` | `object` | Update operators — see below |
| `upsert` | `boolean` | Default `false` |
| `arrayFilters` | `array` | Optional; items are plain filter objects (P3) |

**`update` operator schema** — each operator is an optional key with `additionalProperties`:

| Operator | `additionalProperties` value type | Description in schema |
|----------|-----------------------------------|-----------------------|
| `$set` | `{}` (any) | Set field values. Keys support dot-notation and positional operator (`"array.$.field"`) to update the element matched by `$elemMatch` in the filter. |
| `$unset` | `{ "type": "string", "const": "" }` | Remove fields. Use `""` as the value. Supports dot-notation and positional `array.$.field`. |
| `$inc` | `{ "type": "number" }` | Increment numeric fields. |
| `$mul` | `{ "type": "number" }` | Multiply numeric fields. |
| `$min` | `{}` | Set field to value only if less than current. |
| `$max` | `{}` | Set field to value only if greater than current. |
| `$rename` | `{ "type": "string" }` | Rename fields — value is the new name. |
| `$push` | `{}` | Append value to array. |
| `$pull` | `{}` | Remove matching elements from array. |
| `$addToSet` | `{}` | Add to array only if not already present. |
| `$currentDate` | `{ "oneOf": [{ "type": "boolean" }, { "type": "object" }] }` | Set field to current date/timestamp. |
| `$setOnInsert` | `{}` | Set fields only when upserting a new document. |

Schema also includes a top-level `examples` array showing a `$elemMatch` + `$.` positional update end-to-end.

### Confirm Dialog

Same `ConfirmChoiceDialog` pattern as bulk edit and delete. Shows:
- Filter summary (first 60 chars of filter JSON)
- Update summary (first 60 chars of update JSON)
- Match count: `N document(s) will be updated`
- Upsert note if `upsert: true`

Options:
- `a` → apply
- `c` / `Escape` → cancel

### Result Toast

```
Updated M / matched N    (success, M > 0)
No documents modified    (info, M = 0 but N > 0)
No documents matched     (warning, N = 0)
```

### `updateMany` in `mongodb.ts`

```typescript
export async function updateMany(
  collectionName: string,
  filter: Filter<Document>,
  update: Document,
  options: { upsert?: boolean } = {},
): Promise<{ matchedCount: number; modifiedCount: number; upsertedCount: number }>
```

## File Structure

| File | Change |
|------|--------|
| `src/providers/mongodb.ts` | Add `updateMany()` |
| `src/types.ts` | Add `BulkQueryUpdateConfirmation` interface |
| `src/state.ts` | Add `bulkQueryUpdateConfirmation` to `AppState`; `SHOW_BULK_QUERY_UPDATE_CONFIRM` / `CLEAR_BULK_QUERY_UPDATE_CONFIRM` actions |
| `src/actions/queryUpdate.ts` | New — `openEditorForQueryUpdate()`, `generateUpdateSchema()` |
| `src/components/BulkQueryUpdateConfirmDialog.tsx` | New — wraps `ConfirmChoiceDialog` |
| `src/hooks/useDocumentEditKeys.ts` | Add `Ctrl+U` handler |
| `src/hooks/useDialogKeys.ts` | Add `bulkQueryUpdateConfirmation` dialog block |
| `src/commands/builder.ts` | Add `doc:bulk-query-update` command |
| `src/App.tsx` | Mount `<BulkQueryUpdateConfirmDialog>` overlay |
| `site/src/content/docs/guide/usage.md` | Document bulk update under Editing section |
| `site/src/content/docs/reference/key-bindings.md` | Add `Ctrl+U` to Documents table |

## Keyboard

| Key | Context | Action |
|-----|---------|--------|
| `Ctrl+U` | Document view | Open bulk query update editor |
| `a` | Confirm dialog | Apply update |
| `c` / `Escape` | Confirm dialog | Cancel |
