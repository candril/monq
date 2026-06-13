# 060: Tmux Document Preview

**Status**: Done

## Description

Open the currently selected document in an external editor inside a tmux split pane, without moving focus away from monq. As the row cursor moves in monq, the split loads the newly selected document. Saving from the split applies the edit to MongoDB.

## Out of Scope

- Managing multiple preview split panes
- Preview synchronization outside tmux beyond exposing/copying the generated file path

## Capabilities

- **P1**: Add a remappable shortcut to open the selected document in a detached tmux split.
- **P1**: Keep monq focused after opening the split.
- **P1**: Load the selected document when navigation changes rows.
- **P1**: Apply document edits when the split file is saved.
- **P1**: Do not force-discard dirty editor buffers during navigation.
- **P2**: Show a useful fallback when tmux is unavailable.

## Technical Notes

- Use the existing relaxed EJSON serialization used by the in-app preview/edit flows.
- Store the preview file under the OS temporary directory and rewrite it on selection changes.
- Use a stable file per document id so saving a dirty buffer after row navigation still applies to the document the buffer represents.
- Capture the tmux pane id with `split-window -d -P -F '#{pane_id}'` so updates can target the preview pane without focusing it.
- Default binding: `Shift+P` via `doc.open_preview_tmux`.
