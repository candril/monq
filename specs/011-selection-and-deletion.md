# Selection and Deletion

**Status**: Draft

## Description

Visual selection mode for bulk operations on documents. Supports selecting individual rows, ranges, and all documents. Deletion requires explicit selection first — no way to delete without selecting.

## Capabilities

### P1 - Must Have

- `v` enters selection mode
- `j/k` extends selection up/down in selection mode
- `Ctrl+A` selects all documents (matching current filter)
- `Escape` exits selection mode
- `Shift+D` deletes selected documents
- Confirmation dialog before deletion (Presto/riff style):
  - Shows count of rows being deleted
  - Preview of first 5 documents to be deleted
  - Requires explicit confirmation

### P2 - Should Have

- `y` duplicates selected documents (insert with new _id)
- Visual indicator showing selected rows (different background color)
- Selection count in header

## Design Notes

- Nothing can be deleted without first entering selection mode
- Confirmation dialog is mandatory — no `--force` or skip
- After deletion, reload documents and exit selection mode
