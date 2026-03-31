# Bulk Query Update / Delete

**Status**: Done

## Description

Run a MongoDB `updateMany` or `deleteMany` against the active collection directly from the
TUI. The user edits a JSONC template in `$EDITOR` pre-populated with the active filter.
After saving, monq counts matching documents and shows a confirm dialog before writing
anything. Empty filters trigger a mandatory second confirmation to prevent accidental
full-collection writes.

## Out of Scope

- Aggregation pipeline updates (`updateMany` with pipeline-style update — use the pipeline editor)
- Per-document preview of what will change (use bulk edit for that)
- `arrayFilters` as a first-class template key (users can add them manually; positional `$` covers the common case)

## Capabilities

### P1 - Must Have

- Command palette entries **"Bulk Update"** / **"Bulk Delete"** open `$EDITOR` with a JSONC template
- Template pre-populates `filter` from the active query bar state (simple or BSON)
- Bulk update template contains `update` (`{ "$set": {} }`) and `upsert: false`
- Bulk delete template contains only `filter`
- Schema sidecar (`update-schema.json` / `delete-schema.json`) written to `$TMPDIR/monq/<collection>/`; referenced via `$schema` key
- Schema covers all common update operators; `$set` / `$unset` / `$inc` `properties` populated from `schemaMap` with field types and dot-notation paths
- On save: parse JSONC, run `countDocuments(filter)` to get match count
- Confirm dialog: filter summary, update/delete summary, match count
  - Update: `a` apply / `c`+`Escape` cancel
  - Delete: `d` delete / `c`+`Escape` cancel
- Empty update (all operators are `{}`) → bail with toast "Nothing to update — add fields to $set (or another operator)"
- Empty filter (`{}`) → first confirm proceeds normally; on `a`/`d` escalates to **second confirm dialog** with `y` required — "Empty filter — ALL N documents in collection will be updated/deleted"
- On apply: `updateMany` / `deleteMany` → toast with counts; reload documents
- Parse error reopens editor with inline `// !! PARSE ERROR:` comment (retry loop)

### P2 - Should Have

- Comment hint in template header mentioning `$setOnInsert` for upsert use — **done** (static, always shown)
- `doc.bulk_query_update` / `doc.bulk_query_delete` as configurable `ActionName` entries — **done**; no default binding (configurable via `~/.config/monq/config.toml`)

### P3 - Nice to Have

- `arrayFilters` as an optional top-level key (passed through to `updateMany` if present)

## Technical Notes

### JSONC Templates

**Update:**
```jsonc
// Monq — bulk update · collection @ db
// Operators: $set $unset $inc $push $pull $addToSet $rename $min $max $mul $currentDate $setOnInsert
// Positional: use "array.$.field" in $set/$unset to update element matched by $elemMatch in filter
// Tip: set "upsert": true to insert a new document when no match — use $setOnInsert for insert-only fields
{
  "$schema": "/tmp/monq/{collection}/update-schema.json",
  "filter": { /* active filter */ },
  "update": { "$set": {} },
  "upsert": false
}
```

**Delete:**
```jsonc
// Monq — bulk delete · collection @ db
// All documents matching the filter will be PERMANENTLY DELETED.
{
  "$schema": "/tmp/monq/{collection}/delete-schema.json",
  "filter": { /* active filter */ }
}
```

### JSON Schema (`update-schema.json`)

`$set`, `$unset`, `$inc` have `properties` populated from `schemaMap` (field name + type).
All operators have `additionalProperties` for arbitrary dot-notation paths.
`$set` description documents the positional `array.$.field` pattern.
Top-level `examples` includes an `$elemMatch` + `$.` positional update end-to-end.

### Empty filter double-confirm

`emptyFilter: boolean` is set in both `BulkQueryUpdateConfirmation` and
`BulkQueryDeleteConfirmation`. `useDialogKeys` tracks `bulkQueryUpdateAwaitingFinal` /
`bulkQueryDeleteAwaitingFinal` — pressing the apply key when `emptyFilter` is true escalates
to the second dialog instead of applying. Second dialog requires `y` (not `a`/`d`) to
proceed.

### Keyboard

No default key binding — available via command palette only. Users can configure:

```toml
[keys]
"doc.bulk_query_update" = "ctrl+u"
"doc.bulk_query_delete" = "shift+x"
```

## File Structure

| File | Change |
|------|--------|
| `src/providers/mongodb.ts` | Add `updateManyDocuments()`, `deleteManyDocuments()`, `countDocuments()` |
| `src/types.ts` | Add `BulkQueryUpdateConfirmation`, `BulkQueryDeleteConfirmation` (both with `emptyFilter`) |
| `src/state.ts` | Add both confirmation fields to `AppState`; 4 new actions |
| `src/actions/queryUpdate.ts` | New — `openEditorForQueryUpdate()`, `openEditorForQueryDelete()`, `generateUpdateSchema()`, `generateFilterSchema()` |
| `src/components/BulkQueryUpdateConfirmDialog.tsx` | New — renders first + second (final) confirm |
| `src/components/BulkQueryDeleteConfirmDialog.tsx` | New — renders first + second (final) confirm |
| `src/config/types.ts` | Add `doc.bulk_query_update`, `doc.bulk_query_delete` to `ActionName` |
| `src/config/keymap.ts` | Add both with `[]` (no default binding) |
| `src/hooks/useDocumentEditKeys.ts` | Handler for both actions (guards against palette/query open) |
| `src/hooks/useDialogKeys.ts` | Dialog key blocks with two-stage empty-filter escalation |
| `src/hooks/useKeyboardNav.ts` | Propagate new focused index / awaiting flags |
| `src/hooks/usePaletteActions.ts` | `doc:bulk-query-update` and `doc:bulk-query-delete` cases |
| `src/commands/builder.ts` | "Bulk Update" and "Bulk Delete" palette entries |
| `src/App.tsx` | Mount both confirm dialog overlays |
| `site/src/content/docs/guide/usage.md` | "Bulk update / delete via query" section |
| `site/src/content/docs/reference/configuration.md` | Both actions in keybindings table |
