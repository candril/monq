# Confirm Dialogs

**Status**: Done

## Description

Generic modal confirmation dialogs used across the app for destructive or irreversible actions. A single `ConfirmDialog` component handles all confirmation flows via badge-style selectable options navigated with `h`/`l` and confirmed with `Enter`.

## Out of Scope

- Nested / stacked dialogs
- Dialogs with free-text input fields

## Capabilities

### P1 - Must Have (all done)

- **`ConfirmDialog`**: displays a list of lines (text, dim, or danger style) above a row of focusable option badges — **done**
  - `h`/`l` navigate focus between options
  - `Enter` confirms the focused option
  - Rendered as an overlay at the bottom of the screen
- Used for:
  - **Delete confirmation** (`Shift+D`): shows count + first 5 doc previews; options: Delete / Cancel — **done**
  - **Pipeline-to-simple**: options: New Tab / Overwrite / Cancel — **done**
  - **Bulk edit side-effects**: options: Back / Skip / Delete / Insert / Both / Cancel — **done**

### P2 - Should Have

- `Escape` as universal cancel (in addition to explicit Cancel option) — **done**

## Key Files

- `src/components/ConfirmDialog.tsx` — `ConfirmDialog` component; `ConfirmOption` type
- `src/state.ts` — `deleteConfirmation`, `bulkEditConfirmation`, `pipelineConfirm` state fields
- `src/App.tsx` — renders the appropriate `<ConfirmDialog>` based on active confirmation state
- `src/hooks/useKeyboardNav.ts` — `h`/`l`/`Enter`/`Escape` handlers for each dialog variant

## Notes

`ConfirmChoiceDialog` (a simpler key-press list variant) also exists in `ConfirmDialog.tsx` but is currently unused — all confirmation flows use `ConfirmDialog`.
