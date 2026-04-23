# Ephemeral Peek Tabs — `{` / `}` Collection Browser

**Status**: Done

## Description

Browse collections without committing to a tab. Pressing `}` / `{` advances or
retreats through the current database's collection list, showing each
collection in a single **ephemeral tab** that gets reused (not duplicated) as
you keep pressing. The first real interaction — typing a query, editing a
doc, cloning the tab — **promotes** the ephemeral tab into a regular tab. If
you don't promote, switching to another tab or pressing `Esc` in the sidebar
**discards** the ephemeral tab and returns you to wherever you were.

The sidebar becomes a genuine browser: moving the cursor with `j` / `k` when
the sidebar is focused auto-peeks the highlighted collection via the same
ephemeral-tab mechanism.

Mental model: VS Code's "preview tab" for files. Single click opens in
italics; typing or double-click promotes.

## Out of Scope

- More than one ephemeral tab at a time (max one, globally).
- Cross-database peek (`}` only walks collections in the current DB).
- Persistence of ephemeral tabs across restarts — they're transient by
  definition.
- A dedicated "promote" command in the command palette — Enter on the
  sidebar (and the auto-promote triggers listed below) cover the ergonomic
  paths.
- Reusing the ephemeral tab to peek at *query* results rather than
  collections (interesting, but a separate feature).

---

## Capabilities

### P1 — Must Have

#### Peeking with `{` / `}`

- **New keymap actions** `collection.peek_next` (default `}`) and
  `collection.peek_prev` (default `{`). Both are unbound in monq today.
- `}` advances to the next collection in `state.collections`; `{` retreats.
  Wraps around at the ends.
- If no ephemeral tab exists yet, pressing `}` / `{` creates one, starting
  from the active tab's collection (or index 0 if no tab is active).
- If an ephemeral tab already exists, pressing `}` / `{` **updates it in
  place** — same tab id, same slot, new collection, state reset to
  defaults (no query, no sort, default columns).
- If `}` / `{` would land on a collection that already has a **real** tab,
  switch to that real tab instead of creating/updating an ephemeral. In
  that case, any existing ephemeral tab is discarded.
- Peeking is a global binding — works from the doc view, not just the
  sidebar.

#### Sidebar as live browser

- When the sidebar is focused, `j` / `k` / `↓` / `↑` still move the
  cursor, but they **also** trigger a peek to the highlighted collection.
  So moving the cursor feels like scrolling through collections live.
- Sidebar `Enter` on the cursor row:
  - If the cursor collection is the ephemeral tab's collection → promote.
  - Else if the cursor collection has a real tab → switch to it (existing
    behaviour).
  - Else → open a new real tab (existing behaviour).
  - In all cases, blur the sidebar.
- Sidebar `Esc`:
  - If an ephemeral tab is currently active → **discard** it and restore
    the pre-peek tab, then blur the sidebar.
  - Else → blur the sidebar (existing behaviour).

#### Promotion (ephemeral → real)

- **Explicit**: Sidebar Enter (above), or any action that the user
  obviously "commits to" — see auto-promote list.
- **Auto-promote** when the user performs any of these actions on the
  ephemeral tab:
  - `OPEN_QUERY` (pressed `/` to edit the filter)
  - `OPEN_QUERY_BSON`
  - `SUBMIT_QUERY` with a non-empty query
  - `CYCLE_SORT` (changed sort)
  - `ENTER_PIPELINE_MODE`
  - `ENTER_SELECTION_MODE` (`v`)
  - `CLONE_TAB` (the source promotes before cloning)
  - Any document mutation (`SET_DOCUMENTS` from an edit, insert, or delete
    action — these flow through actions/editMany.ts etc. and ultimately
    reload, which is fine to promote on)
  - Setting a mark (`m<letter>`)
- Promotion is a single reducer field flip (`ephemeral: true → false`)
  plus clearing `preEphemeralTabId`. No tab id change, no reorder.
- Purely passive actions do **not** promote: `nav.down`/`nav.up` (doc
  list), column nav, preview toggle, reload, yank.

#### Discarding

- `}` / `{` while an ephemeral tab is active → the update happens
  in-place, not a discard.
- `SWITCH_TAB` to any non-ephemeral tab → the ephemeral tab is discarded.
  This covers `[`, `]`, `1`-`9`, tab.prev, tab.next, and palette "Open
  collection" hits on a real-tab collection.
- `BLUR_SIDEBAR` while an ephemeral tab is active and the user pressed
  Esc (not when blurring via Enter-promote) → discarded.
- `SET_COLLECTIONS` where the ephemeral's collection no longer exists →
  discarded (handles drop-from-other-client case).
- `CLOSE_TAB` on the ephemeral tab → normal close, plus clear
  `preEphemeralTabId`.
- When discarded, `activeTabId` is restored to `preEphemeralTabId` (the
  tab that was active when the peek session started). If that tab no
  longer exists, fall back to the last tab.

#### Visual: dim tab bar entry

- In `TabBar`, the ephemeral tab renders with **`theme.textDim`** for both
  its number and its collection name, regardless of whether it's the
  active tab. The active/inactive distinction for real tabs is unchanged
  (`theme.primary` / `theme.textDim`). So: an ephemeral tab that is
  currently active reads as dim + "selected" context; a real active tab
  reads as bright primary. The eye immediately locates the "real work".
- No other glyphs, no `~` prefix, no italics. Colour alone per the
  sidebar's established convention.

#### Sidebar: ephemeral collection is NOT "has open tab"

- `openCollectionNames` in `App.tsx` is derived from
  `state.tabs.filter(t => !t.ephemeral)`, so the sidebar's `theme.text`
  highlighting for "has an open tab" doesn't fire for the ephemeral.
- The ephemeral's collection still shows as the active one
  (`theme.primary`) because it *is* the active tab. The distinction is
  simply that it doesn't count as a "committed" tab.

### P2 — Should Have

- **Toast feedback** when wrapping around at the collection list ends
  (`"Wrapped to first"` / `"Wrapped to last"`). Optional — the cursor
  position usually makes wrapping obvious.
- **Palette entry** `Promote peek tab` — visible only when an ephemeral
  tab is active. Gives a keyboard-discoverable escape hatch for users who
  don't know about the sidebar Enter.
- **Respect `state.activeTabId` fallback**: if `preEphemeralTabId`
  references a tab that got closed during the peek session (unlikely but
  possible), fall back to the most recently active non-ephemeral tab.

### P3 — Nice to Have

- **Spinner indication on the ephemeral tab** while its docs are loading —
  mostly a no-op since the existing `loading` state already surfaces.
- **Config option** for `peek.debounce_ms` to throttle sidebar auto-peek
  for users on slow remote Mongo. Default 0 (no debounce). Shelved until
  someone complains.
- **Alt-keybinding** `Alt+j` / `Alt+k` as secondary bindings for users
  who find `{` / `}` awkward on non-US layouts.

---

## Technical Notes

### New state

```typescript
// src/types.ts
interface Tab {
  // ...existing fields
  /** If true, this tab is a transient peek that will be discarded unless
   *  promoted. Only one ephemeral tab may exist at a time. */
  ephemeral: boolean
}

interface AppState {
  // ...existing fields
  /** Tab id that was active when the current peek session started.
   *  Used to restore focus on discard. Null when no peek is in-flight. */
  preEphemeralTabId: string | null
}
```

### New actions

```typescript
// src/state.ts
| { type: "PEEK_COLLECTION"; delta: -1 | 1 }
| { type: "PROMOTE_EPHEMERAL_TAB" }
| { type: "DISCARD_EPHEMERAL_TAB" }
```

Plus modifications to existing reducer cases (see "Reducer changes").

### `PEEK_COLLECTION` reducer logic

All in `tabsReducer`:

```typescript
case "PEEK_COLLECTION": {
  if (state.collections.length === 0) {
    // Toast: "No collections to peek" — dispatch SHOW_MESSAGE
    return state
  }

  // Find the anchor: the ephemeral tab if any, else the active tab.
  const ephemeral = state.tabs.find((t) => t.ephemeral)
  const anchorTab = ephemeral ?? state.tabs.find((t) => t.id === state.activeTabId)
  const anchorName = anchorTab?.collectionName
  const currentIdx = anchorName
    ? state.collections.findIndex((c) => c.name === anchorName)
    : -1

  const len = state.collections.length
  const nextIdx =
    currentIdx === -1
      ? action.delta > 0 ? 0 : len - 1
      : (currentIdx + action.delta + len) % len
  const nextCol = state.collections[nextIdx]

  // If a real tab already exists for this collection → switch to it
  // (discard any ephemeral as a side effect).
  const existingReal = state.tabs.find(
    (t) => t.collectionName === nextCol.name && !t.ephemeral,
  )
  if (existingReal) {
    const tabsWithoutEphemeral = ephemeral
      ? state.tabs.filter((t) => !t.ephemeral)
      : state.tabs
    const targetTab = tabsWithoutEphemeral.find((t) => t.id === existingReal.id)!
    return {
      ...state,
      ...restoreFromTab(state, targetTab),
      tabs: tabsWithoutEphemeral,
      activeTabId: existingReal.id,
      preEphemeralTabId: null,
      sidebarSelectedIndex: sidebarIndexForCollection(state, nextCol.name),
    }
  }

  // Otherwise create or update the ephemeral tab.
  if (ephemeral) {
    // Update in place: new collectionName, reset state (like a fresh OPEN_TAB)
    const reset: Tab = { ...makeFreshTab(ephemeral.id, nextCol.name), ephemeral: true }
    return {
      ...state,
      tabs: state.tabs.map((t) => (t.ephemeral ? reset : t)),
      activeTabId: ephemeral.id,
      ...freshTabAppStateReset(),
      sidebarSelectedIndex: sidebarIndexForCollection(state, nextCol.name),
    }
  }

  // No ephemeral yet — create one, remembering the pre-peek active tab.
  const newEphemeral: Tab = { ...makeFreshTab(generateTabId(), nextCol.name), ephemeral: true }
  const savedTabs = state.activeTabId
    ? state.tabs.map((t) =>
        t.id === state.activeTabId ? snapshotTab(state, t.id, t.collectionName) : t,
      )
    : state.tabs
  return {
    ...state,
    tabs: [...savedTabs, newEphemeral],
    activeTabId: newEphemeral.id,
    preEphemeralTabId: state.activeTabId,
    view: "documents",
    ...freshTabAppStateReset(),
    sidebarSelectedIndex: sidebarIndexForCollection(state, nextCol.name),
  }
}
```

Where `makeFreshTab()` and `freshTabAppStateReset()` are small helpers
extracted from the existing `OPEN_TAB` body (where the same reset logic
already lives inline). Extracting them is a cheap cleanup that pays for
itself immediately in this new code path.

### `PROMOTE_EPHEMERAL_TAB`

```typescript
case "PROMOTE_EPHEMERAL_TAB": {
  if (!state.tabs.some((t) => t.ephemeral)) return state
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.ephemeral ? { ...t, ephemeral: false } : t)),
    preEphemeralTabId: null,
  }
}
```

### `DISCARD_EPHEMERAL_TAB`

```typescript
case "DISCARD_EPHEMERAL_TAB": {
  const ephemeral = state.tabs.find((t) => t.ephemeral)
  if (!ephemeral) return state

  const remainingTabs = state.tabs.filter((t) => !t.ephemeral)
  const restoreId =
    state.preEphemeralTabId && remainingTabs.some((t) => t.id === state.preEphemeralTabId)
      ? state.preEphemeralTabId
      : remainingTabs[remainingTabs.length - 1]?.id ?? null

  const restoreTab = restoreId ? remainingTabs.find((t) => t.id === restoreId) : null

  return {
    ...state,
    ...(restoreTab ? restoreFromTab(state, restoreTab) : {}),
    tabs: remainingTabs,
    activeTabId: restoreId,
    preEphemeralTabId: null,
  }
}
```

### Reducer modifications (auto-promote + auto-discard)

Rather than littering every mutating reducer case with `if (ephemeral)
promote`, add a top-level pre-pass in `appReducer`:

```typescript
// src/state.ts
const AUTO_PROMOTE_ACTIONS = new Set<AppAction["type"]>([
  "OPEN_QUERY",
  "OPEN_QUERY_BSON",
  "CYCLE_SORT",
  "ENTER_PIPELINE_MODE",
  "ENTER_SELECTION_MODE",
  "CLONE_TAB",
  // Mark operations (set only — jump is passive; the active tab doesn't mutate)
  "ENTER_MARK_PENDING",
])

// SUBMIT_QUERY only promotes when the query is non-empty — use a helper
// rather than adding to the set.

export function appReducer(state: AppState, action: AppAction): AppState {
  // Auto-promote the ephemeral tab on mutating actions.
  if (AUTO_PROMOTE_ACTIONS.has(action.type)) {
    state = maybePromoteEphemeral(state)
  } else if (
    action.type === "SUBMIT_QUERY" &&
    (state.queryInput.trim() || state.bsonFocusedSection !== "filter")
  ) {
    state = maybePromoteEphemeral(state)
  }

  for (const reducer of reducers) {
    const result = reducer(state, action)
    if (result !== null) return result
  }
  return state
}

function maybePromoteEphemeral(state: AppState): AppState {
  if (!state.tabs.some((t) => t.ephemeral)) return state
  return {
    ...state,
    tabs: state.tabs.map((t) => (t.ephemeral ? { ...t, ephemeral: false } : t)),
    preEphemeralTabId: null,
  }
}
```

Document-mutation actions (edit, insert, delete) happen in `src/actions/`
modules which dispatch `SET_DOCUMENTS` after the write. `SET_DOCUMENTS`
itself isn't necessarily a "commit" (it also fires on initial load), so
we don't auto-promote there. Instead, the action helpers in
`src/actions/editMany.ts`, `src/actions/pipeline.ts`, etc. explicitly
dispatch `PROMOTE_EPHEMERAL_TAB` before performing the mutation. This
keeps the promote signal sharp.

### `SWITCH_TAB` auto-discard

```typescript
// tabsReducer, inside SWITCH_TAB case
case "SWITCH_TAB": {
  if (action.tabId === state.activeTabId) return state

  // If the target is the ephemeral tab itself, just switch normally.
  // If the target is a real tab AND an ephemeral exists → discard the ephemeral.
  const target = state.tabs.find((t) => t.id === action.tabId)
  if (!target) return state

  const ephemeral = state.tabs.find((t) => t.ephemeral)
  const shouldDiscardEphemeral = ephemeral != null && !target.ephemeral

  // ...existing snapshot logic

  const nextTabs = shouldDiscardEphemeral
    ? tabs.filter((t) => !t.ephemeral)
    : tabs

  return {
    ...state,
    ...restoreFromTab(state, target),
    tabs: nextTabs,
    activeTabId: action.tabId,
    preEphemeralTabId: shouldDiscardEphemeral ? null : state.preEphemeralTabId,
    sidebarSelectedIndex: sidebarIndexForCollection(state, target.collectionName),
  }
}
```

### `SET_COLLECTIONS` auto-discard (orphaned ephemeral)

In `connectionReducer`'s `SET_COLLECTIONS` case, if the ephemeral tab's
collection is no longer in the list, drop it:

```typescript
case "SET_COLLECTIONS": {
  const maxIdx = Math.max(0, action.collections.length - 1)
  const clampedSidebarIndex = Math.min(state.sidebarSelectedIndex, maxIdx)

  const ephemeral = state.tabs.find((t) => t.ephemeral)
  const ephemeralMissing = ephemeral && !action.collections.some((c) => c.name === ephemeral.collectionName)
  const tabs = ephemeralMissing ? state.tabs.filter((t) => !t.ephemeral) : state.tabs
  const activeTabId = ephemeralMissing && state.activeTabId === ephemeral!.id
    ? (state.preEphemeralTabId ?? tabs[tabs.length - 1]?.id ?? null)
    : state.activeTabId
  const preEphemeralTabId = ephemeralMissing ? null : state.preEphemeralTabId

  return {
    ...state,
    collections: action.collections,
    collectionsLoading: false,
    sidebarSelectedIndex: clampedSidebarIndex,
    tabs,
    activeTabId,
    preEphemeralTabId,
  }
}
```

### Keymap

```typescript
// src/config/types.ts — add to ActionName
"collection.peek_next"
"collection.peek_prev"

// src/config/keymap.ts — DEFAULT_BINDINGS
"collection.peek_next": ["}"],
"collection.peek_prev": ["{"],
```

### Keyboard handling

In `src/hooks/useKeyboardNav.ts`:

- **Global** `}` / `{` handlers near the existing document-view handler
  table. Gated on `state.activeTabId` and no query/palette/dialog active
  (same gating as the rest of the doc-view handlers):

  ```typescript
  ["collection.peek_next", () => dispatch({ type: "PEEK_COLLECTION", delta: 1 })],
  ["collection.peek_prev", () => dispatch({ type: "PEEK_COLLECTION", delta: -1 })],
  ```

- **Sidebar-focused** nav handling changes so `j` / `k` *also* dispatch
  `PEEK_COLLECTION`. The cleanest way is to let `SIDEBAR_NAV` and
  `PEEK_COLLECTION` be the same action when focused: drop the separate
  `SIDEBAR_NAV` dispatch from the sidebar branch and dispatch
  `PEEK_COLLECTION` instead. `PEEK_COLLECTION`'s reducer already updates
  `sidebarSelectedIndex` via `sidebarIndexForCollection()`, so the cursor
  stays in sync.

- **Sidebar-focused** `Enter` routes through an updated
  `handleSidebarEnter` that promotes-if-ephemeral:

  ```typescript
  export function handleSidebarEnter(state, dispatch) {
    const col = state.collections[state.sidebarSelectedIndex]
    if (!col) return
    const ephemeral = state.tabs.find((t) => t.ephemeral)
    if (ephemeral && ephemeral.collectionName === col.name) {
      dispatch({ type: "PROMOTE_EPHEMERAL_TAB" })
      dispatch({ type: "BLUR_SIDEBAR" })
      return
    }
    const existingReal = state.tabs.find((t) => t.collectionName === col.name && !t.ephemeral)
    if (existingReal) {
      dispatch({ type: "SWITCH_TAB", tabId: existingReal.id })
    } else {
      dispatch({ type: "OPEN_TAB", collectionName: col.name })
    }
    dispatch({ type: "BLUR_SIDEBAR" })
  }
  ```

- **Sidebar-focused** `Esc`: dispatch `DISCARD_EPHEMERAL_TAB` (no-op if
  none) before `BLUR_SIDEBAR`. If no ephemeral exists, behaviour is
  identical to today.

### TabBar

```tsx
// src/components/TabBar.tsx
{tabs.map((tab, i) => {
  const active = tab.id === activeTabId
  const filter = filterSuffix(tab.query)
  const isEphemeral = tab.ephemeral
  const numberColor = isEphemeral ? theme.textDim : active ? theme.primary : theme.textDim
  const nameColor = isEphemeral ? theme.textDim : active ? theme.text : theme.textDim
  // ...
})}
```

No layout change, no glyphs — purely a colour swap for the ephemeral row.
Active ephemeral = dim dim; real active = primary + text; real inactive =
dim dim (same as ephemeral today). If that last clash bothers us, we can
italicise the ephemeral name — but let's ship the simpler version first.

### App.tsx — exclude ephemeral from `openCollectionNames`

```tsx
const openCollectionNames = useMemo(
  () => new Set(state.tabs.filter((t) => !t.ephemeral).map((t) => t.collectionName)),
  [state.tabs],
)
```

### Files

| File | Change |
|------|--------|
| `src/types.ts` | Add `ephemeral: boolean` to `Tab`; add `preEphemeralTabId` to `AppState` |
| `src/state.ts` | 3 new actions; auto-promote pre-pass in router; `AUTO_PROMOTE_ACTIONS` set |
| `src/state/reducers/tabs.ts` | `PEEK_COLLECTION` / `PROMOTE_EPHEMERAL_TAB` / `DISCARD_EPHEMERAL_TAB`; extract `makeFreshTab` + `freshTabAppStateReset` helpers from `OPEN_TAB`; `SWITCH_TAB` discards stray ephemeral |
| `src/state/reducers/connection.ts` | `SET_COLLECTIONS` drops orphaned ephemeral |
| `src/config/types.ts` + `keymap.ts` | `collection.peek_next` / `collection.peek_prev`, defaults `}` / `{` |
| `src/hooks/useKeyboardNav.ts` | Global `}` / `{` handlers; sidebar-focused `j`/`k` dispatches `PEEK_COLLECTION`; `Esc` in sidebar dispatches `DISCARD_EPHEMERAL_TAB` first |
| `src/actions/sidebar.ts` | `handleSidebarEnter` promotes ephemeral when cursor matches |
| `src/actions/editMany.ts` + other mutation actions | Dispatch `PROMOTE_EPHEMERAL_TAB` before the mutation where appropriate |
| `src/components/TabBar.tsx` | Dim colouring for ephemeral tab |
| `src/App.tsx` | `openCollectionNames` excludes ephemeral |
| `specs/054-ephemeral-peek-tabs.md` | This spec |
| `specs/README.md` | Add row |

### Edge cases

- **Peek with 0 collections**: toast `No collections to peek`, no state
  change.
- **Peek with 1 collection**: advancing wraps to itself — effectively a
  no-op but still creates the ephemeral tab on the first press.
- **Peek while a real tab already exists for every collection**: every
  peek just cycles through real tabs. Equivalent to a slower `]` /
  `[`. Acceptable.
- **Ephemeral tab promoted, then `}` pressed**: treated as "no ephemeral,
  start peeking from the active (newly-promoted) tab". A new ephemeral is
  created on the *next* collection.
- **`}` while sidebar is focused but cursor is elsewhere**: global
  binding still fires → ephemeral advances. The sidebar cursor also
  jumps because `PEEK_COLLECTION` updates `sidebarSelectedIndex`.
- **Closing the ephemeral tab with `d`**: already works via existing
  `CLOSE_TAB`. Need to clear `preEphemeralTabId` in that case — add a
  one-liner in the `CLOSE_TAB` case.
- **Single-doc fetch latency**: each peek triggers a normal document load
  via `useDocumentLoader`. For local Mongo this is effectively instant;
  for remote Mongo the user will feel the latency but the UX matches a
  normal tab switch. No debouncing for v1.
- **Pipeline-mode tab is ephemeral and user edits the pipeline file**:
  promote via `ENTER_PIPELINE_MODE` is already handled; file-watcher
  writes flow through the normal pipeline reducer which doesn't need
  extra promotion logic since `ENTER_PIPELINE_MODE` fires first.
- **Active tab is ephemeral and user runs a mutation from the palette**
  (bulk update, bulk delete): the palette dispatches the action, which
  runs through the auto-promote pre-pass. If the mutation's action type
  isn't in `AUTO_PROMOTE_ACTIONS`, the mutation action helpers should
  dispatch `PROMOTE_EPHEMERAL_TAB` explicitly before the write.

### Verification

Manual against a local Mongo with ≥ 5 collections:

1. Boot monq with a single tab open; press `}` — a new dim-coloured tab
   appears, showing the next collection.
2. Press `}` repeatedly — the same dim tab updates each press. No new
   tabs accumulate.
3. Press `{` — it moves backwards.
4. Press `/` and type a query — the tab becomes bright (promoted). It
   now behaves like a normal tab. Press `}` again — a *new* dim tab is
   created for peeking.
5. With a dim tab active, press `]` or `1` to switch to a real tab — the
   dim tab disappears.
6. Open the sidebar (`Ctrl+B`), move the cursor with `j`/`k` — a dim tab
   appears and updates as you move. Press `Esc` — the dim tab vanishes
   and the previously-active tab is restored.
7. Open the sidebar, move to a collection, press `Enter` — the dim tab
   is promoted; focus returns to the doc list; the tab bar shows the
   collection in bright colours.
8. Drop the peeked collection from another client and wait for the
   collections list to refresh — the dim tab disappears cleanly.

---

## Keyboard summary

| Key | Action |
|-----|--------|
| `}` | Peek next collection (creates or updates ephemeral tab) |
| `{` | Peek previous collection |
| Sidebar `j` / `k` | Move cursor AND peek to highlighted collection |
| Sidebar `Enter` | Promote ephemeral (if cursor matches), else switch/open |
| Sidebar `Esc` | Discard ephemeral (if any) and blur sidebar |
| `/`, `v`, `e`, `i`, `D`, `m`, `s`, `Ctrl+F`, `t` (on ephemeral) | Auto-promote to real |
| `]` / `[` / `1`-`9` (switch to real tab) | Discard ephemeral as a side effect |
