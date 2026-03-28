# Selection and Deletion

**Status**: Done

## Description

Visual selection mode for bulk operations on documents. Supports selecting individual rows, ranges, and all documents. Deletion requires explicit selection first — no way to delete without selecting.

## What's Done

- `v` enters selection mode; `Escape` exits
- `j`/`k` moves and extends selection in selection mode
- `Space` toggles individual row selection
- `o` jumps to the other end of the selection range
- `Ctrl+A` selects all documents matching current filter
- `Shift+D` triggers deletion with `ConfirmDialog` (shows count + first 5 doc previews)
- Visual indicator: selected rows shown with blue `theme.selection` background
- Selection count shown in header: "SELECT N" / "selected N"
- After deletion: documents reloaded, selection mode exited

## What's Missing

Nothing — all P1 and P2 capabilities are complete.

## Capabilities

### P1 - Must Have

- `v` enters selection mode
- `j`/`k` extends selection up/down in selection mode
- `Ctrl+A` selects all documents (matching current filter)
- `Escape` exits selection mode
- `Shift+D` deletes selected documents
- Confirmation dialog before deletion:
  - Shows count of rows being deleted
  - Preview of first 5 documents to be deleted
  - Requires explicit confirmation

### P2 - Should Have

- Visual indicator showing selected rows (different background color) — **done**
- Selection count in header — **done**

## Design Notes

- Nothing can be deleted without first entering selection mode
- Confirmation dialog is mandatory — no `--force` or skip
- After deletion, reload documents and exit selection mode
- Selection state lives in `AppState`: `selectionMode`, `selectionStart`, `selectedRows: Set<number>`, `frozenSelection`

## Key Files

- `src/state.ts` — `ENTER_SELECTION_MODE`, `EXIT_SELECTION_MODE`, `TOGGLE_CURRENT_ROW`, `MOVE_SELECTION`, `JUMP_SELECTION_END`, `SELECT_ALL`, `FREEZE_SELECTION`, `SHOW_DELETE_CONFIRM`, `CLEAR_DELETE_CONFIRM`, `MOVE_DELETE_FOCUS`, `SET_DELETE_FOCUS`
- `src/hooks/useKeyboardNav.ts` — `v`, `Space`, `o`, `Ctrl+A`, `Shift+D`, `Escape` handlers + delete confirm dialog
- `src/components/ConfirmDialog.tsx` — `ConfirmDialog` component used for delete confirmation
- `src/components/DocumentList.tsx` — selected row highlight rendering
- `src/components/Header.tsx` — selection count display

## Keyboard

| Key | Action |
|-----|--------|
| `v` | Enter selection mode |
| `j` / `k` | Move + extend selection |
| `Space` | Toggle current row |
| `o` | Jump to other end of selection |
| `Ctrl+A` | Select all |
| `Shift+D` | Delete selected (with confirm) |
| `Escape` | Exit selection mode |
