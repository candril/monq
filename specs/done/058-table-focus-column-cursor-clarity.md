# Table Focus and Column Cursor Clarity

**Status**: Done

## Description

Make the document table's focus state and selected column easier to understand, especially while the sidebar is focused and live-peeking collections.

## Out of Scope

- Changing the `h`/`l` sidebar handoff behavior.
- Making the JSON preview scroll to or highlight the selected field.
- Replacing the current table renderer.

## Capabilities

- P1: The document table receives an explicit focus flag from app state.
- P1: The selected column is highlighted across visible rows while the document table is focused.
- P1: The active cell is visually distinct from the rest of the selected column.
- P1: The document row/cell cursor is suppressed while the sidebar owns keyboard focus.
- P1: The document table viewport width matches the actual layout when both sidebar and right preview are visible.

## Technical Notes

- This is intentionally isolated in its own jj change so the visual treatment can be reverted or refined easily.
- The width fix computes the main content width after subtracting the sidebar, then splits that width for right-preview mode.
