# Fix Column Browser / Preview Overlap

**Status**: Done

## Description

When the preview panel is open, the horizontal column browser in the document list is
misaligned — it renders behind/underneath the preview panel instead of staying within
the document list viewport.

## Out of Scope

- Preview panel positioning or size changes
- Column browser feature changes beyond fixing the layout bug

---

## Capabilities

### P1 — Must Have

- When preview is open (right or bottom position), the column browser (h/l navigation)
  remains visible and scrollable within the document list area only
- Column headers and cell content do not render underneath or behind the preview panel
- The document list viewport correctly constrains its content width/height based on the
  preview position and size

### P2 — Should Have

- No visual jank or reflow when toggling the preview on/off
- Column browser scrolling respects the reduced viewport when preview is active

### P3 — Nice to Have

- N/A

---

## Technical Notes

### Root cause

The issue is likely in the layout flex/box sizing logic in `App.tsx` where the document
list and preview panels share the viewport. The document list may not be correctly
constraining its width (when preview is right) or height (when preview is bottom).

Current layout in `App.tsx`:

```tsx
<box
  flexGrow={1}
  overflow="hidden"
  flexDirection={state.previewPosition === "bottom" ? "column" : "row"}
>
  <box
    flexGrow={1}
    width={state.previewPosition === "right" ? "50%" : "100%"}
    height={state.previewPosition === "bottom" ? "50%" : "100%"}
    overflow="hidden"
  >
    <DocumentList ... />
  </box>
  <DocumentPreview ... />
</box>
```

The `DocumentList` component may need to explicitly inherit and respect the constrained
dimensions from its parent box, or the ScrollBox used for horizontal column scrolling
may need width clamping.

### Potential fixes

1. **Explicit width constraint**: Pass the effective viewport width as a prop to
   `DocumentList` and use it to constrain the internal ScrollBox width
2. **Flex basis instead of width**: Use `flexBasis` instead of `width` on the document
   list container to ensure the flex layout respects the split
3. **Overflow clipping**: Ensure `overflow="hidden"` is set on the document list
   container box at the correct level

### Testing

1. Open a collection with multiple columns
2. Press `h`/`l` to scroll columns horizontally
3. Toggle preview with `v` — verify columns remain visible and don't overlap preview
4. Cycle preview position with `V` — verify columns are constrained in both right and
   bottom positions
5. Resize terminal — verify layout remains correct at different sizes

---

## File Structure

**Modified files:**
```
src/App.tsx                 # Fix document list container box sizing
src/components/DocumentList.tsx  # Ensure ScrollBox respects parent constraints (if needed)
```
