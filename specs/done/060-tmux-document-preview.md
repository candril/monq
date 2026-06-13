# 060: Tmux Document Preview

**Status**: Done

## Description

Open the currently selected document in an external editor inside a tmux split pane, without moving focus away from monq. As the row cursor moves in monq, the split reloads to show the newly selected document.

## Out of Scope

- Editing documents through the preview split
- Managing multiple preview split panes
- Preview synchronization outside tmux beyond exposing/copying the generated file path

## Capabilities

- **P1**: Add a remappable shortcut to open the selected document in a detached tmux split.
- **P1**: Keep monq focused after opening the split.
- **P1**: Rewrite and reload the preview when navigation selects another document.
- **P2**: Show a useful fallback when tmux is unavailable.

## Technical Notes

- Use the existing relaxed EJSON serialization used by the in-app preview.
- Store the preview file under the OS temporary directory and rewrite it on selection changes.
- Capture the tmux pane id with `split-window -d -P -F '#{pane_id}'` so updates can target the preview pane without focusing it.
- Default binding: `Shift+P` via `doc.open_preview_tmux`.
