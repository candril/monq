# Loading Spinner: Animate All Columns

**Status**: Draft

## Description

The big loading spinner (`Loading.tsx`) uses a 3-character braille string but only the first character ever changes. The second and third characters are always `⣿` (fully filled), so they look static. The result is a spinner that feels lopsided — the left column "spins" while the rest is a dead block.

All three columns should animate to create a fuller, more polished spinning effect.

## Out of Scope

- Changing the spinner size or character count
- Animated loading messages
- Changing the small inline `Spinner` component

---

## Capabilities

### P1 — Must Have

- All three braille characters in `BIG_SPINNER_FRAMES` animate across frames, so the entire block feels alive — not just the leftmost column
- The animation still reads as a single coherent spin/rotation, not random flicker
- Frame rate stays at 120ms (no change)

### P2 — Should Have

- The animation has a sense of direction (e.g. a dot sweeping left-to-right, or a wave rolling across all three characters) rather than all columns doing the same thing in unison

### P3 — Nice to Have

- Smooth looping — the last frame transitions cleanly into the first without a visible jump
- After the first loop start animating randomly. 

---

## Technical Notes

### Current frames

```ts
const BIG_SPINNER_FRAMES = ["⣾⣿⣿", "⣽⣿⣿", "⣻⣿⣿", "⢿⣿⣿", "⡿⣿⣿", "⣟⣿⣿", "⣯⣿⣿", "⣷⣿⣿"]
```

Only character 0 changes (one dot missing, rotating clockwise). Characters 1 and 2 are always `⣿`.

### Approach

Design new frames where the "missing dot" sweeps across all three characters. For example, an 8-dot braille cell has positions that can map to a 6-wide (3 chars x 2 cols) or 12-high (3 chars x 4 rows) grid. A single missing dot traveling across that grid would create a wave effect spanning the full width.

Alternatively, stagger the existing single-column animation: column 0 leads, column 1 follows 2-3 frames behind, column 2 follows another 2-3 frames behind. This creates a ripple without designing entirely new frames.

### File Structure

**Modified files:**
```
src/components/Loading.tsx   # new BIG_SPINNER_FRAMES array
```
