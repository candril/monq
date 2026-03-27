# Document Editing

**Status**: Done

## Description

Edit MongoDB documents by opening them in `$EDITOR`. Uses renderer suspend/resume to hand off the terminal. Changes are saved back to the database via `replaceOne`.

## Implementation Notes

- Press `e` on selected document to edit
- Document serialized as EJSON to temp file: `/tmp/monq-{collection}-{_id}.json`
- Original `_id` used in filename to find the document for update (allows changing _id in the doc)
- `renderer.suspend()` exits alternate screen, spawns `$EDITOR` with `stdin/stdout/stderr: "inherit"`
- On editor close, `renderer.resume()` restores the TUI
- Edited EJSON parsed and compared to original — only updates if changed
- `replaceOne` with original `_id` to save changes
- Always reloads documents after returning from editor (via `RELOAD_DOCUMENTS`)
- Error messages shown via `SHOW_MESSAGE` dispatch
- Falls back to `vi` if `$EDITOR` and `$VISUAL` are unset

## Key Files

- `src/actions/edit.ts` — `editDocument()`: write temp file, spawn editor, parse result, update DB
- `src/hooks/useKeyboardNav.ts` — `e` key handler with suspend/resume
- `src/providers/mongodb.ts` — `replaceDocument()`, `serializeDocument()`, `deserializeDocument()`

## Keyboard

| Key | Action |
|-----|--------|
| `e` | Open selected document in $EDITOR |

## Future (P2)

- Inline field editing in preview panel
- Confirmation prompt with diff before saving
- Undo last edit
