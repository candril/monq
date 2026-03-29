# ADR-006: Keyboard Handling

**Status**: Accepted

## Decision
Self-contained overlays (palette, filter suggestions, confirm dialogs) own their keyboard handlers locally. `useKeyboardNav` handles document-view navigation only and is split into focused sub-hooks by domain.

## Rationale
- One 900-line keyboard hook with six responsibilities is harder to navigate than three focused 150-line hooks
- Overlays that manage their own keyboard input are more self-contained and easier to reason about
- The alternative (routing all keys through one handler) requires the handler to know about every overlay's internal state

## Consequences
- `useKeyboardNav` is split into e.g. `useDocumentNav`, `useEditActions`, `usePipelineKeys`
- Confirm dialogs handle their own Up/Down/Enter rather than delegating to `useKeyboardNav`
- The boundary rule: if a keyboard handler only makes sense while a specific overlay is visible, it belongs in that overlay
