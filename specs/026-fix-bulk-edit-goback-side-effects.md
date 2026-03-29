# Fix Bulk Edit "Go Back" Side Effect Detection

**Status**: Draft

## Description
When editing multiple documents and a doc is deleted in the editor, the side-effect confirm dialog appears. Choosing "go back" re-opens the editor without the deleted doc (correct). But saving and closing the editor shows "No changes" instead of re-showing the side-effect dialog.

## Root Cause
The `goBack` handler in `useDocumentEditKeys` calls `openEditorForMany` with `editedDocs` as the new `originalDocs`. The deleted doc is no longer in `editedDocs`, so the diff sees no missing docs — the side effect is lost.

## Expected Behaviour
After "go back", the original document set should remain the source of truth for side-effect detection. Only the edited content changes. The side-effect dialog should re-appear if docs are still missing or added after the second edit.

## Out of Scope
- Changing the bulk edit file format
- Multi-level undo

## Capabilities

### P1 - Must Have
- After "go back", missing/added docs are still detected relative to the **original** document set
- Side-effect dialog re-appears correctly after the second editor session
