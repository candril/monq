# Shift-JK Collection Switch

**Status**: Done

## Description

Add `J` / `K` shortcuts to move the selected collection without first focusing the sidebar.

## Out of Scope

- Changing normal `j` / `k` row movement in the document table.
- Changing focused-sidebar `j` / `k` behavior.
- Adding a new collection picker UI.

## Capabilities

- P1: `J` selects/peeks the next collection from the sidebar cursor.
- P1: `K` selects/peeks the previous collection from the sidebar cursor.
- P1: The shortcuts clamp at collection list ends, matching focused-sidebar navigation.

## Technical Notes

- The shortcuts reuse `PEEK_COLLECTION` with `anchor: "cursor"`, so existing ephemeral tab and real-tab switch behavior is preserved.
- Focus stays where it was; this is a fast collection switch, not a sidebar focus command.
- `Ctrl+J` / `Ctrl+K` were avoided as defaults because terminals and overlays commonly treat them as Return/down and line-edit/navigation controls.
