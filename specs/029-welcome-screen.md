# Welcome Screen — DB and Collection Picker

**Status**: Done

## Description

On startup, when no DB or collection is pre-selected, show a full-screen welcome component
that guides the user through picking a DB then a collection. The screen is inline (not an
overlay palette) and supports both letter-based instant picking and fuzzy filtering from a
single input — no mode switching required.

## Out of Scope

- Saved connections / history (separate spec)
- Custom palette UI components
- Any startup flow changes when a collection is already resolved from the URI

## Capabilities

### P1 - Must Have

- Welcome screen replaces the `null` content area when `activeTabId === null && !collectionsLoading && !error`
- Step 1: centered list of databases with `[a]`–`[z]` shortcut labels; pressing a label letter picks instantly
- Step 2: same layout for collections, with breadcrumb showing selected DB
- Single search input always visible at the bottom of the list:
  - Pressing a letter that matches a shortcut label → instant pick (no Enter)
  - Any other typing → fuzzy-filters the list (non-matching items dimmed, labels preserved)
  - Backspace clears the filter character by character
- `↑`/`↓` and `j`/`k` navigate the list cursor; `Enter` picks the highlighted item
- Backspace on empty input in step 2 → returns to DB picker (spec 030)
- `q` quits the app
- The existing Ctrl+P palette remains available for in-app DB/collection switching (unchanged)

### P2 - Should Have

- If URI includes a DB name, skip step 1 and go straight to collection picker
- Two-column layout for large lists (> 13 items) to avoid scrolling

### P3 - Nice to Have

- Hint row at the bottom showing available keys
- Monq branding / tagline in the center above the list

## Technical Notes

### Layout

```
┌──────────────────────────────────────────────────────┐
│ Monq                        mongodb://localhost       │  Header (unchanged)
├──────────────────────────────────────────────────────┤
│                                                      │
│                         Monq                         │  brand (primary, bold)
│                   mongodb://localhost                 │  host (textDim)
│                                                      │
│               Select a database                      │  step title (text)
│                                                      │
│           [a]  admin                                 │
│           [b]  myapp                                 │
│           [c]  logs                                  │
│           [d]  analytics                             │
│                                                      │
│          ──────────────────────────                  │
│          > _                                         │  search input
│                                                      │
│    a–z pick · ↑↓ navigate · q quit                   │  hint (textMuted)
└──────────────────────────────────────────────────────┘
```

Step 2 breadcrumb:

```
│               myapp  ›  Select a collection          │
│                                                      │
│    a–z pick · ↑↓ navigate · ← back · q quit         │
```

### Interaction model

| Input | Behavior |
|-------|----------|
| `a`–`z` matching a label exactly, query empty | Instant pick |
| Any char not matching a shortcut, or query non-empty | Appended to fuzzy query |
| `↑`/`↓` or `j`/`k` | Move cursor through list |
| `Enter` | Pick highlighted item |
| `Backspace` (query non-empty) | Delete last filter char |
| `Backspace` (query empty, step 2) | Return to DB picker |
| `q` (query empty) | Quit |

### Label assignment

Positional: item 0 → `a`, item 1 → `b`, … item 25 → `z`. Items beyond 26 have no label
(reachable via fuzzy + cursor). Labels are stable and not derived from item names — no
collision logic needed.

### Filtering behaviour

When query is non-empty, items are fuzzy-filtered. Non-matching items are hidden (unlike
the dimming described in brainstorm; hidden is cleaner). Matching items keep their original
`[a]`–`[z]` labels and shortcut still works.

### App.tsx simplification

Moving the welcome flow into `WelcomeScreen` lets us remove from `App.tsx`:
- The `paletteMode === "databases"` branch of `paletteVisible`
- The `effectivePaletteMode` derivation for the `"collections"` auto-open case
- The `useEffect` that watches `state.dbPickerOpen` and sets `paletteMode = "databases"`
- The `handlePaletteClose` escape-block guard for the no-db case

`paletteMode` in `App.tsx` becomes only `"commands"` (Ctrl+P main palette) — no more
`"databases"` / `"collections"` during startup.

### Files

| File | Change |
|------|--------|
| `src/components/WelcomeScreen.tsx` | New component |
| `src/App.tsx` | Replace `null` with `<WelcomeScreen>`, remove startup palette logic |
| `specs/029-welcome-screen.md` | This file |
| `specs/030-backspace-to-db-picker.md` | Implemented as part of WelcomeScreen |
