# Tab Utilities

**Status**: Done

## Description

Additional tab-level utilities beyond basic navigation: clone tab, pipeline-to-simple mode conversion with a confirm dialog, and a preview mode that visualizes the current simple filter as pipeline stages without activating a real pipeline.

## Out of Scope

- Persistent tab sessions across restarts
- Shared state between tabs

## Capabilities

### P1 - Must Have

- **Clone tab** (`t`): open a new tab with the same collection + query as the current tab; documents reloaded fresh
- **Pipeline-to-simple dialog**: when pressing `Tab` to switch from pipeline to simple mode (if the pipeline has conditions that can't be losslessly translated), show a `ConfirmChoiceDialog` with two options:
  - Switch to simple (drops pipeline conditions)
  - Open simple filter in a new tab (clone + switch to simple)

### P2 - Should Have

- **Preview pipeline** (`Shift+F` in simple mode): visualizes the current simple filter + sort as pipeline stages in the pipeline bar — without actually running as an aggregate. Shows `[preview]` badge. Pressing `Shift+F` again clears the preview. — **dropped**: `Shift+F` was repurposed to `TOGGLE_FILTER_BAR` (show/hide the filter bar). The `SHOW_SIMPLE_AS_PIPELINE` / `CLEAR_PREVIEW_PIPELINE` / `previewPipeline` state fields were never implemented.

## Implementation Notes

### Clone Tab

`CLONE_TAB` in `src/state.ts`:
- Creates a new tab with the same `collectionName`, `queryInput`, `queryMode`, sort state
- Assigns a new unique `id` (timestamp-based)
- Sets `reloadCounter` to trigger `useDocumentLoader`

### Pipeline-to-Simple Dialog

`ConfirmChoiceDialog` variant with key-press choices:
- `s` → `SWITCH_TO_SIMPLE`: clears pipeline, migrates `$match` conditions to simple query
- `t` → `CONFIRM_PIPELINE_TO_SIMPLE`: clones current tab then switches to simple mode in the clone
- `Escape` → `DISMISS_CONFIRM`: cancel, stay in pipeline mode

The `lossless` flag from `filterToSimple()` in `src/query/parser.ts` determines whether to show the dialog or perform a silent switch.

### Preview Pipeline

`SHOW_SIMPLE_AS_PIPELINE` action in `src/state.ts`:
- Calls `rebuildPreview()` to synthesize pipeline stages from current `queryInput` + sort state
- Stores result in `previewPipeline` (separate from `pipeline`)
- `PipelineBar` renders `previewPipeline` with a `[preview]` badge when `pipeline` is empty
- `CLEAR_PREVIEW_PIPELINE` removes the preview
- `rebuildPreview()` is also called automatically when sort or filter changes while preview is active

## Key Files

- `src/state.ts` — `CLONE_TAB`, `CONFIRM_PIPELINE_TO_SIMPLE`, `SWITCH_TO_SIMPLE`, `TOGGLE_FILTER_BAR`
- `src/hooks/useKeyboardNav.ts` — `t`, `Shift+F` (toggle filter bar) key handlers; confirm dialog key handlers
- `src/components/ConfirmDialog.tsx` — `ConfirmDialog` used for pipeline-to-simple prompt
- `src/query/parser.ts` — `filterToSimple()` with `lossless` flag

## Keyboard

| Key | Context | Action |
|-----|---------|--------|
| `t` | Document list | Clone current tab |
| `Shift+F` | Anywhere | Toggle filter bar visibility (show/hide) |
| `Tab` | Pipeline active | Trigger pipeline-to-simple dialog |
