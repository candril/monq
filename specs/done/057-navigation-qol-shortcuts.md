# Navigation QoL Shortcuts

**Status**: Done

## Description

Add expected Vim-style navigation shortcuts and an in-app keyboard shortcut reference.

## Out of Scope

- Changing existing query/filter semantics.
- Replacing the command palette.
- Loading unloaded pages synchronously when jumping to the end.

## Capabilities

- P1: `*` aliases the existing selected-value filter action.
- P1: `g` jumps to the first loaded document row.
- P1: `G` jumps to the last loaded document row and requests more documents when possible.
- P1: `Ctrl+L` returns from the sidebar to the document list.
- P1: `z` recenters the selected document row in the viewport.
- P1: `?` opens a shortcut help overlay that reflects the active keymap.

## Technical Notes

- New shortcuts are remappable keymap actions.
- The help overlay owns its close keys locally, matching the overlay keyboard-handling ADR.
