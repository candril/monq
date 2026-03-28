# Document Editing

**Status**: Done

## Description

Edit MongoDB documents by opening them in `$EDITOR`. Supports single-document edit, bulk edit of multiple selected documents in one editor session, and inserting new documents from a template. Uses renderer suspend/resume to hand off the terminal. Changes are saved back to the database.

## Out of Scope

- Inline field editing in the TUI (no in-app text editing)
- Schema validation before save

## Capabilities

### P1 - Must Have

- `e` opens the selected document in `$EDITOR` as EJSON
- On save+quit: `replaceOne` with original `_id`
- Reload documents after returning from editor
- Fallback to `vi` if `$EDITOR` and `$VISUAL` are unset
- Error shown as toast on save failure

### P2 - Should Have

- **Bulk edit**: `e` with an active selection opens all selected docs in one JSON array file
  - Detect removed documents (deleted from array) → prompt to delete from DB
  - Detect added documents (new objects in array) → prompt to insert into DB
  - Confirm dialog with choices: back / skip side effects / delete / insert / both / cancel
  - JSON Schema sidecar (`.monq-docs-schema.json`) generated for editor LSP completions
- **Insert new document**: `i` key opens editor with a blank template derived from current collection schema
  - Pre-populated with field names and sensible type defaults
  - Saved as `insertOne` on quit

### P3 - Nice to Have

- Confirmation diff before saving
- Undo last edit

## Implementation Notes

- Single doc: temp file at `/tmp/monq-{collection}-{_id}.json`
- Bulk edit: temp file at `$TMPDIR/monq/{collection}/edit-{timestamp}.json` with array of docs; schema sidecar at `.monq-docs-schema.json` in same dir
- Insert: temp file at `$TMPDIR/monq/{collection}/insert-{timestamp}.json` with blank template
- `renderer.suspend()` / `renderer.resume()` wraps all editor spawns
- All operations use `serializeDocument()` / `deserializeDocument()` (EJSON) for type fidelity

## Key Files

- `src/actions/edit.ts` — `editDocument()`: single-doc edit
- `src/actions/editMany.ts` — `openEditorForMany()`, `openEditorForInsert()`, `applyConfirmActions()`
- `src/hooks/useKeyboardNav.ts` — `e`, `i` key handlers; bulk-edit confirm dialog handlers
- `src/providers/mongodb.ts` — `replaceDocument()`, `insertDocument()`, `deleteDocument()`, `serializeDocument()`, `deserializeDocument()`
- `src/components/ConfirmDialog.tsx` — `ConfirmChoiceDialog` for bulk-edit action choices

## Keyboard

| Key | Action |
|-----|--------|
| `e` | Open selected document(s) in $EDITOR |
| `i` | Open editor to insert a new document |
