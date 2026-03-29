# App.tsx Cleanup

**Status**: Draft

## Description
Extract remaining inline logic from App.tsx into dedicated components or utility functions. App.tsx should be a thin composition layer only.

## Out of Scope
- Changing any behaviour or visual output
- State management changes

## Capabilities

### P1 - Must Have
- Document count string extracted to a pure function in `utils/format.ts`: `formatDocumentCount(loaded, filtered, total, hasFilter): string`
- `PipelineConfirmDialog` component — encapsulates lines/options building for the pipeline→simple confirm dialog
- `BulkEditConfirmDialog` component — encapsulates lines/options building for the bulk edit side-effects dialog  
- `DeleteConfirmDialog` component — encapsulates lines/options building for the delete confirm dialog
- App.tsx passes only the minimal props each dialog needs (the confirmation state + focusedIndex)

### P2 - Should Have
- `formatDocumentCount` covered by a unit test in `utils/format.test.ts`

## Technical Notes
- The three dialogs currently build `ConfirmLine[]` and `ConfirmOption[]` inline in App.tsx via IIFEs — move this logic into wrapper components in `src/components/`
- Each wrapper component receives its slice of state and `focusedIndex`, renders `<ConfirmDialog>` internally
- `docSummary` helper currently defined in App.tsx — move to `utils/format.ts` or keep local to the new dialog components

## File Structure
- Modify: `src/App.tsx`
- Modify: `src/utils/format.ts`, `src/utils/format.test.ts`
- Add: `src/components/PipelineConfirmDialog.tsx`
- Add: `src/components/BulkEditConfirmDialog.tsx`  
- Add: `src/components/DeleteConfirmDialog.tsx`
