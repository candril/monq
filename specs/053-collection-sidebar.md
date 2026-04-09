# Collection Sidebar — Vertical Collapsible Navigation Pane

**Status**: Draft

## Description

A vertical, collapsible collection-navigation pane on the **left** side of the
main content area. Lists every collection in the current database, marks which
one is in the active tab, marks which ones already have an open tab, and lets
the user open or switch to a collection from the keyboard. Hidden by default;
toggled with `Ctrl+B`.

Today, collection switching happens through two paths: the `WelcomeScreen`
(full-screen picker shown when no tab is open) and the `Ctrl+P` palette
(overlay fuzzy picker). Neither gives the user a *persistent at-a-glance view*
of what collections exist in the current database — power users browsing an
unfamiliar DB end up reopening `Ctrl+P` repeatedly just to remember what's
there. A persistent sidebar, toggleable so it doesn't waste space when the
user knows exactly where they're going, fills that gap without disturbing the
existing flows.

## Out of Scope

- Database switching from inside the sidebar (use `WelcomeScreen` / `Ctrl+P` /
  `Switch Database` palette command — unchanged).
- Mouse/click interaction.
- Collection stats (counts, sizes) — kept fast and stat-free, matching
  spec 002's philosophy.
- Drag-to-resize. Width is fixed (configurable later via `config.toml` if
  needed).
- Persistence of open/closed state across restarts. Sidebar state is
  in-memory only for v1.
- Replacement of either the `WelcomeScreen` or the `Ctrl+P` palette flow.
  The sidebar is additive.
- Showing the sidebar on the `WelcomeScreen` (welcome already does this job
  better at startup).
- Fuzzy filter input inside the sidebar — kept a pure browse surface;
  `Ctrl+P` remains the find-by-name tool. Revisit if large-DB usage demands it.

---

## Capabilities

### P1 — Must Have

- **Toggle visibility** with `Ctrl+B` (new keymap action `sidebar.toggle`).
  Default-bound, configurable through the existing `[keys]` config.
- **Hidden by default.** First press of `Ctrl+B` opens the sidebar AND focuses
  it. Second press closes it (see P2 for the open-but-unfocused case).
- **Renders only when at least one tab is open** (`activeTabId !== null`). On
  the `WelcomeScreen` the sidebar is suppressed.
- **Layout**: fixed width (24 columns), full height of the main content row,
  border on the right edge, sits to the left of the existing `DocumentList` +
  `DocumentPreview` composite. Implemented by wrapping the existing main flex
  box in an outer `flexDirection="row"` box that places `<CollectionSidebar />`
  first.
- **Lists every collection** in `state.collections` (already populated by
  `useMongoConnection`). Order matches the existing list (server order). Views
  and timeseries collections render with a small type tag (`v`, `t`) to mirror
  the palette behaviour.
- **Active-tab indicator**: the collection corresponding to
  `activeTab.collectionName` is rendered with `theme.primary` foreground and a
  left-edge `▶` marker. Updates as the user switches tabs (`[`, `]`, `1`-`9`).
- **Open-tab dots**: every collection that already has at least one open tab
  is suffixed with a `●` glyph in `theme.textDim`, so the user can see at a
  glance which tabs are already loaded.
- **Cursor + Enter**:
  - When focused, `j` / `k` / `↓` / `↑` move the cursor (reusing the existing
    `nav.up` / `nav.down` keymap actions, intercepted before the doc-list
    handler when sidebar is focused).
  - `Enter` on the cursor row:
    - If the collection already has an open tab → switch to that tab
      (`SWITCH_TAB`).
    - Otherwise → open it in a new tab (`OPEN_TAB`).
  - Either way, focus returns to the document list and the sidebar stays
    visible so the user can keep browsing.
- **Escape** (when sidebar focused) → unfocus the sidebar and return focus to
  the document list. The sidebar remains visible.
- **Header**: top of the sidebar shows `state.dbName` in `theme.primary`, with
  a thin separator line below it (matches the visual weight of the existing
  `TabBar`).
- **Scrolling**: when collection count exceeds visible height, the cursor row
  scrolls into view (same pattern as `CommandPalette`'s scrollbox auto-scroll —
  see spec 002).

### P2 — Should Have

- **`Ctrl+B` while sidebar is open but not focused** re-focuses the sidebar
  (rather than closing it). This handles the case where the user opened the
  sidebar, picked a collection (focus jumped to docs), and now wants to come
  back to the sidebar without closing-and-reopening it.

  Open/closed and focused/unfocused are two separate concepts:

  | State | `Ctrl+B` | `Esc` |
  |-------|----------|-------|
  | closed | open + focus | n/a |
  | open, focused | close | unfocus (sidebar stays open) |
  | open, unfocused | focus | no-op (Esc retains existing meaning) |

- **`d` on the sidebar cursor** closes any open tab(s) for that collection.
  Mirrors `tab.close` behaviour applied from the sidebar's vantage point.
  No-op if the collection has no open tab. Uses the same keymap action
  (`tab.close`) so user rebindings propagate automatically.

- **Cursor follows active tab**: when the user switches tabs via `]` / `[` /
  `1`-`9`, the sidebar cursor automatically jumps to the index of that
  collection in `state.collections` so the user's "where am I?" mental model
  stays in sync. Only the cursor moves; sidebar focus state is unchanged.

### P3 — Nice to Have

- **Persist `sidebarOpen` to `config.toml`** so users who always want it open
  get their preference back on next launch.
- **Sidebar position config** (`left` | `right`) — for v1 left is hard-coded.
- **Collection-count badge** in the sidebar header (e.g. `shop · 23`) — cheap,
  just `state.collections.length`.
- **Fuzzy filter input** at the bottom of the sidebar — same UX as the
  `WelcomeScreen` bottom search input. Deferred to avoid duplicating `Ctrl+P`
  until real usage pressure makes it worth the overlap.

---

## Technical Notes

### State additions

```typescript
// src/types.ts (AppState)
sidebarOpen: boolean              // is the pane visible
sidebarFocused: boolean           // is keyboard focus inside the pane
sidebarSelectedIndex: number      // cursor row in the sidebar
```

No per-tab state — sidebar UI state is global. Three fields; the collection
list itself already lives in `state.collections`.

### Actions

```typescript
// src/state.ts (AppAction)
| { type: "TOGGLE_SIDEBAR" }                       // P1: state-dependent open/focus/close
| { type: "FOCUS_SIDEBAR" }                        // P2
| { type: "BLUR_SIDEBAR" }                         // P1 (Esc handler)
| { type: "SIDEBAR_NAV"; delta: -1 | 1 }           // cursor up/down
| { type: "SIDEBAR_SET_INDEX"; index: number }     // direct set (used by P2 cursor-follows-tab)
```

`TOGGLE_SIDEBAR` reducer logic:

```
if (!sidebarOpen)               → { sidebarOpen: true, sidebarFocused: true }
else if (sidebarFocused)        → { sidebarOpen: false, sidebarFocused: false }
else                            → { sidebarFocused: true }    // P2
```

`SWITCH_TAB` and `OPEN_TAB` reducers gain an extra step (P2): set
`sidebarSelectedIndex` to the index of the new active collection in
`state.collections`. `CLOSE_TAB` does not — the cursor should track intentional
navigation, not teardown.

### Keymap

```typescript
// src/config/types.ts — add to ActionName
"sidebar.toggle"

// src/config/keymap.ts — DEFAULT_BINDINGS
"sidebar.toggle": ["ctrl+b"],
```

`Ctrl+B` is currently unbound in monq — no conflict. (`Ctrl+P`, `Ctrl+F`,
`Ctrl+E`, `Ctrl+R`, `Ctrl+A`, `Ctrl+D`, `Ctrl+U` are taken; `Ctrl+B` is free.)

### Keyboard handling

In `src/hooks/useKeyboardNav.ts`, intercept keys based on `state.sidebarFocused`
**before** the existing `docHandlers` table runs:

```typescript
if (state.sidebarFocused) {
  if (matches(key, keymap["nav.down"])) { dispatch({ type: "SIDEBAR_NAV", delta: 1 });  return }
  if (matches(key, keymap["nav.up"]))   { dispatch({ type: "SIDEBAR_NAV", delta: -1 }); return }
  if (key.name === "return")            { handleSidebarEnter(state, dispatch);          return }
  if (key.name === "escape")            { dispatch({ type: "BLUR_SIDEBAR" });           return }
  // P2: `d` on cursor closes tab(s) for that collection
  if (matches(key, keymap["tab.close"])) { closeTabsForSidebarCursor(state, dispatch);  return }
  return  // swallow everything else so it doesn't fall through to the doc list
}

// Toggle works regardless of focus state
if (matches(key, keymap["sidebar.toggle"])) {
  dispatch({ type: "TOGGLE_SIDEBAR" })
  return
}
```

`handleSidebarEnter` lives in `src/actions/sidebar.ts`:

```typescript
const col = state.collections[state.sidebarSelectedIndex]
const existing = state.tabs.find(t => t.collectionName === col.name)
if (existing) {
  dispatch({ type: "SWITCH_TAB", tabId: existing.id })
} else {
  dispatch({ type: "OPEN_TAB", collectionName: col.name })
}
dispatch({ type: "BLUR_SIDEBAR" })   // return focus to doc list, sidebar stays visible
```

### Layout integration in `App.tsx`

The current main box (`src/App.tsx:392-467`) is `<box flexGrow={1}
flexDirection={...}>` containing the doc list + preview. Wrap it in an outer
row-flex box that adds the sidebar to the left:

```tsx
<box flexGrow={1} flexDirection="row" overflow="hidden">
  {state.sidebarOpen && activeTab && (
    <CollectionSidebar
      dbName={state.dbName}
      collections={state.collections}
      activeCollectionName={activeTab.collectionName}
      openCollectionNames={openCollectionNameSet}
      selectedIndex={state.sidebarSelectedIndex}
      focused={state.sidebarFocused}
    />
  )}
  <box
    flexGrow={1}
    overflow="hidden"
    flexDirection={state.previewPosition === "bottom" ? "column" : "row"}
  >
    {/* existing content: error / welcome / doc list + preview */}
  </box>
</box>
```

`openCollectionNameSet` is derived once per render:
`new Set(state.tabs.map(t => t.collectionName))`.

### Component: `src/components/CollectionSidebar.tsx`

```tsx
interface Props {
  dbName: string
  collections: CollectionInfo[]
  activeCollectionName: string
  openCollectionNames: Set<string>
  selectedIndex: number
  focused: boolean
}

export function CollectionSidebar(props: Props) {
  return (
    <box
      width={24}
      height="100%"
      flexDirection="column"
      backgroundColor={theme.bg}
      border={["right"]}
      borderColor={theme.border}
      paddingX={1}
    >
      <text fg={theme.primary}>{props.dbName}</text>
      <text fg={theme.textMuted}>{"─".repeat(22)}</text>
      <scrollbox flexGrow={1}>
        {props.collections.map((col, i) => {
          const isActive = col.name === props.activeCollectionName
          const hasOpen  = props.openCollectionNames.has(col.name)
          const isCursor = props.focused && i === props.selectedIndex
          return (
            <text key={col.name}>
              <span fg={isCursor ? theme.text : theme.textDim}>
                {isActive ? "▶ " : "  "}
              </span>
              <span fg={isActive ? theme.primary : theme.text}>
                {col.name}
              </span>
              {hasOpen && <span fg={theme.textDim}> ●</span>}
              {col.type !== "collection" && (
                <span fg={theme.textDim}> {col.type[0]}</span>
              )}
            </text>
          )
        })}
      </scrollbox>
    </box>
  )
}
```

### Files

| File | Change |
|------|--------|
| `src/components/CollectionSidebar.tsx` | **New** — the sidebar component |
| `src/actions/sidebar.ts` | **New** — `handleSidebarEnter`, `closeTabsForSidebarCursor` (P2) |
| `src/types.ts` | Add `sidebarOpen` / `sidebarFocused` / `sidebarSelectedIndex` to `AppState` |
| `src/state.ts` | Add `TOGGLE_SIDEBAR` / `FOCUS_SIDEBAR` / `BLUR_SIDEBAR` / `SIDEBAR_NAV` / `SIDEBAR_SET_INDEX` actions and reducer cases. P2: extend `OPEN_TAB` / `SWITCH_TAB` reducers to update `sidebarSelectedIndex` |
| `src/App.tsx` | Wrap main flex box in outer row-flex; render `<CollectionSidebar>` when `sidebarOpen && activeTab` |
| `src/hooks/useKeyboardNav.ts` | Intercept keys when `sidebarFocused`; route toggle key in all states |
| `src/config/types.ts` | Add `"sidebar.toggle"` to `ActionName` |
| `src/config/keymap.ts` | Default binding `"sidebar.toggle": ["ctrl+b"]` |
| `specs/053-collection-sidebar.md` | This spec |
| `specs/README.md` | Add row to "Active Specs" table |

### Edge cases

- **Sidebar cursor out of bounds after DB switch**: `SELECT_DATABASE` already
  clears tabs and reloads collections. Reset `sidebarSelectedIndex` to `0` in
  the same reducer path so the cursor never points past the new list.
- **Empty collection list**: if `state.collections` is empty (fresh or empty
  DB), the sidebar renders just the header and a dim `(no collections)` line.
  `Enter` is a no-op.
- **Collection list reloads while sidebar is focused**: if the active
  collection disappears from the list (e.g. dropped from another client),
  clamp `sidebarSelectedIndex` to `[0, collections.length - 1]` in the
  `SET_COLLECTIONS` reducer.
- **Selection mode interaction**: keyboard handling for selection mode (`v`,
  `space`, etc.) lives in the doc-list branch. Because the sidebar-focused
  branch returns early, selection keys don't reach the sidebar and sidebar
  keys don't reach the doc list — no interference.
- **Pipeline / BSON / simple query bars open while sidebar focused**: the
  query bars already own keyboard focus when open; the sidebar-focused branch
  should only run when no modal/bar is active. Gate on the same conditions
  that `docHandlers` uses today so Esc, Enter, etc. don't double-fire.

### Verification

End-to-end smoke test, performed manually against a local MongoDB:

1. `bun start --uri mongodb://localhost:27017/<db>` — pick a collection from
   the welcome screen, confirm sidebar is hidden by default.
2. Press `Ctrl+B` — sidebar appears on the left, focused, cursor on the active
   collection.
3. `j` / `k` move the cursor; the active collection shows `▶` and
   `theme.primary` color.
4. `Enter` on a different collection → opens new tab, sidebar stays visible,
   focus returns to doc list, the new collection now has a `●` marker.
5. Press `Ctrl+B` again from the doc list — sidebar re-focuses (P2). Press
   `Ctrl+B` once more — sidebar closes.
6. With sidebar focused, press `Esc` — sidebar stays visible, focus returns to
   doc list.
7. Switch tabs with `]` — sidebar cursor follows the new active tab (P2).
8. With sidebar focused, press `d` on a collection that has an open tab — the
   tab closes (P2).
9. Close all tabs → `WelcomeScreen` appears; confirm sidebar is suppressed
   there.
10. Re-confirm `Ctrl+P` palette and existing keybindings still work unmodified.

No automated tests required for v1. If `handleSidebarEnter` or
`closeTabsForSidebarCursor` grow non-trivial, add unit tests covering the
existing-tab vs new-tab branches.

---

## Keyboard summary

| Key | Action |
|-----|--------|
| `Ctrl+B` (closed) | Open sidebar and focus it |
| `Ctrl+B` (open, focused) | Close sidebar |
| `Ctrl+B` (open, unfocused) | Re-focus sidebar (P2) |
| `j` / `k` / `↓` / `↑` (focused) | Move cursor up/down |
| `Enter` (focused) | Switch to existing tab, or open new tab for the collection |
| `d` (focused) | Close open tab(s) for the collection under the cursor (P2) |
| `Esc` (focused) | Unfocus sidebar; sidebar stays visible |

## UX sketch

```
┌────────────────────────┬──────────────────────────────────────────┐
│ shop                   │ shop.orders            docs 1234 / 1234  │
│ ─────────────────────  │ ────────────────────────────────────────│
│   products        ●    │ _id       Author   Status   Date   Total│
│ ▶ orders          ●    │ 6512ab…   Alice    paid     04-01  $129 │
│   users                │ 6512ac…   Bob      pending  04-02   $44 │
│   carts           ●    │ 6512ad…   Carol    paid     04-02  $310 │
│   sessions             │ 6512ae…   Dave     refunded 04-03    $0 │
│   events        v      │ ...                                      │
│   logs                 │                                          │
│                        │                                          │
└────────────────────────┴──────────────────────────────────────────┘
  ▶ = active tab    ● = has open tab    v = view (non-collection)
```
