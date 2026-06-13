# Column Navigation Shortcuts

**Status**: Done

## Description

Add Vim-style shortcuts for jumping across document columns and into the collection sidebar.

## Out of Scope

- New visual chrome or help panels.
- Changes to row navigation, tab navigation, or existing sidebar toggle behavior.

## Capabilities

- P1: `0` jumps to the first visible document column.
- P1: `$` jumps to the last visible document column.
- P1: `Ctrl+H` focuses the collection sidebar without toggling it closed.

## Technical Notes

- Added remappable keymap actions for the new shortcuts.
- Added a reducer-level `SELECT_COLUMN` action so column jumps clamp consistently with column movement.
