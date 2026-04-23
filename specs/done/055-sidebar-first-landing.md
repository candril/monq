# Sidebar-First Landing — Drop Welcome Step 2

**Status**: Done

## Description

Delete the welcome screen's collection picker (step 2) and replace it with a
sidebar-first landing experience. After the DB is picked, the sidebar opens
and focuses, the first collection auto-peeks as an ephemeral tab, and the
user browses with `j` / `k` (live peek via spec 054). Commit with Enter or
any editing action, or fall back to `Ctrl+P` for fuzzy search.

The welcome screen's step 1 (DB picker) is **unchanged** — it still owns
the "no DB yet" state, since the sidebar is scoped to the current DB.

This eliminates the duplication between welcome screen and sidebar that
existed since spec 053 + 054 landed: both were collection browsers, the
sidebar is now strictly more capable (live peek), and having two surfaces
to learn was a friction tax for new users.

## Out of Scope

- Welcome step 1 (DB picker) — kept as-is. Sidebar can't show DBs because
  it's collection-scoped; reworking it is a separate spec.
- Inline collection creation in the sidebar. Use `Ctrl+P` → `Create
  Collection` (existing palette command).
- Letter shortcuts (`[a]`, `[b]`, …) and fuzzy search inside the sidebar.
  `Ctrl+P` palette covers find-by-name; sidebar `j` / `k` covers browse.
- Empty-DB hint text. The sidebar shows `(no collections)` in that state
  and the user is expected to know about `Ctrl+P`.
- Auto-focusing the sidebar when the URI specifies a collection. The user
  was explicit; respect them and land in the doc view as today.

---

## Capabilities

### P1 — Must Have

#### Drop welcome step 2

- The `WelcomeScreen` component only renders when `state.dbName === ""`
  (the step 1 / no-DB case). Its step 2 code path is deleted entirely.
- `App.tsx`'s `showWelcome` condition becomes:
  `!state.error && !state.collectionsLoading && !state.dbName`.
- The `step` prop on `WelcomeScreen` goes away (always step 1 now). The
  `onSelectCollection`, `onCreateCollection`, `onDropCollection`, and
  `onRenameCollection` props are also removed since step 2 was their only
  caller.

#### Auto-land in sidebar after DB pick

- When the following conditions are all true after a state transition,
  open + focus the sidebar and auto-peek the first collection:
  - `state.dbName` is set (DB has been picked)
  - `state.collectionsLoading` is false (collections list has loaded)
  - `state.activeTabId` is null (no tab is open)
  - `state.collections.length > 0` (DB is non-empty)
  - `!state.error`
  - We haven't already landed for this DB session (see "Once per session"
    below)
- "Auto-peek" = dispatch `PEEK_COLLECTION { delta: 1 }` (anchor "active"
  by default, currentIdx = -1 since no active tab → nextIdx = 0). The
  existing reducer creates an ephemeral tab for collection 0.
- "Open + focus the sidebar" = dispatch `TOGGLE_SIDEBAR` from the closed
  state (which opens AND focuses).

#### Once per DB session

- The auto-land is gated by a `useRef<boolean>` in `App.tsx`. The flag is
  set the moment we auto-land and reset whenever `state.dbName` changes
  (i.e. on DB switch via palette / `RESET_DATABASE`).
- Why a ref instead of state: this is purely a "have we already landed"
  signal that doesn't need to participate in rendering or undo. A ref is
  cheap and avoids polluting `AppState` with a UI-only flag.
- After the user discards the auto-peeked ephemeral with Esc, they end up
  in the empty state (no tabs, sidebar focused). The auto-land does NOT
  re-fire — the ref is still set. The user can browse collections again
  via `j` / `k` (which re-creates an ephemeral via the spec 054 path).

#### Empty state behavior

- When `state.dbName` is set but `state.activeTabId` is null and the
  user has dismissed the auto-peek, the main area renders nothing
  (`null`). The sidebar is the only visible affordance, focused.
- This is a transient state — `j` / `k` immediately resumes peeking,
  `Ctrl+P` opens the palette, `Esc` is a no-op, `Ctrl+B` toggles the
  sidebar.

#### URI with a pre-selected collection

- Existing flow is unchanged: the URI's `db.collection` opens directly as
  a real tab on startup. The auto-land effect doesn't fire because
  `state.activeTabId` is set by the time `SET_COLLECTIONS` lands.
- The sidebar stays **closed** in this case. The user explicitly asked
  for a specific collection — don't override their layout. They can open
  the sidebar with `Ctrl+B` if they want to browse.

#### Empty DB (zero collections)

- The auto-land effect doesn't fire (`collections.length === 0`).
- The sidebar still opens and focuses (we want the user to land
  somewhere), but it shows `(no collections)`.
- The user creates via `Ctrl+P` → `Create Collection`. No inline hint.

  Open question: should the sidebar still auto-open in this case, given
  there's nothing to peek? Two options:
  - Yes — at least the user knows they're "in a DB" and the sidebar's
    focus is the cue to act.
  - No — empty sidebar + empty main is two empty zones, which is worse
    than just leaving everything closed and trusting the user to
    `Ctrl+P`.

  I'd default to **yes** (sidebar opens, just not focused, since there's
  nothing to peek). The dim header `shop` + `(no collections)` line is at
  least an unambiguous statement of "you're in shop, it has nothing".

### P2 — Should Have

- **Sidebar header reflects landing state**. When auto-landed, the
  sidebar's `dbName` header is the same as today, but if we want to
  differentiate "you just landed" from "you've been here a while", we
  could subtly highlight the header for the first few seconds. Skip for
  v1 — over-engineering.

### P3 — Nice to Have

- **Auto-promote on first j/k after auto-peek**. The user starts on an
  ephemeral peek of collection 0. If they press `j` to peek collection 1,
  the spec 054 reducer just updates the ephemeral in place — no commit
  trail. If we wanted to "remember they looked at collection 0", we
  could promote 0 to a real tab the first time they navigate away. But
  this is exactly the friction the ephemeral mechanism was designed to
  avoid, so I'd keep it as-is.

---

## Technical Notes

### `App.tsx` changes

```tsx
// New: ref + effects for auto-land
const hasAutoLandedRef = useRef(false)

// Reset the auto-land flag whenever the DB changes (including
// RESET_DATABASE / SELECT_DATABASE flows).
useEffect(() => {
  hasAutoLandedRef.current = false
}, [state.dbName])

// Auto-land effect: open + focus sidebar and auto-peek collection 0
// the first time we land in an "empty after DB pick" state per session.
useEffect(() => {
  if (hasAutoLandedRef.current) return
  if (state.error) return
  if (state.collectionsLoading) return
  if (!state.dbName) return            // welcome step 1 still active
  if (state.activeTabId) return        // URI fast-path or user already in a tab
  if (state.collections.length === 0) {
    // Empty DB — open the sidebar so the user knows where they are,
    // but don't auto-peek (nothing to peek). Mark as landed so we don't
    // re-fire if more state churns.
    hasAutoLandedRef.current = true
    if (!state.sidebarOpen) {
      dispatch({ type: "TOGGLE_SIDEBAR" })
    }
    return
  }
  hasAutoLandedRef.current = true
  if (!state.sidebarOpen) {
    dispatch({ type: "TOGGLE_SIDEBAR" }) // closed → open + focus
  }
  // anchor defaults to "active"; with no active tab, currentIdx = -1
  // and the reducer lands on index 0.
  dispatch({ type: "PEEK_COLLECTION", delta: 1 })
}, [
  state.dbName,
  state.collectionsLoading,
  state.activeTabId,
  state.collections.length,
  state.error,
  state.sidebarOpen,
])
```

```tsx
// Updated: showWelcome no longer triggers on "no active tab"; only on
// "no DB". The empty-after-DB-pick state falls through to the main
// flex box, which now shows nothing (sidebar carries the UX).
const showWelcome = !state.error && !state.collectionsLoading && !state.dbName
```

```tsx
// Updated: sidebar renders whenever it's open AND we have a DB,
// regardless of activeTab. (Today: requires `activeTab`.)
{state.sidebarOpen && state.dbName && (
  <CollectionSidebar
    dbName={state.dbName}
    collections={state.collections}
    activeCollectionName={activeTab?.collectionName ?? ""}
    openCollectionNames={openCollectionNames}
    selectedIndex={state.sidebarSelectedIndex}
    focused={state.sidebarFocused}
  />
)}
```

The `activeCollectionName=""` when no tab is open means no row gets the
`theme.primary` highlight — exactly what we want in the empty state.

### `WelcomeScreen.tsx` changes

- Delete the entire step 2 code path: collection list, the
  `[a]`-`[z]` letter shortcuts for collections, the collection-create /
  drop / rename inline UX.
- Drop the `step`, `collections`, `collectionsLoading`,
  `onSelectCollection`, `onCreateCollection`, `onDropCollection`,
  `onRenameCollection` props.
- The component becomes "DB picker only". Rename internally if it makes
  the file shorter, or leave the name to keep diff noise low.
- Keep all step 1 functionality: DB picker, fuzzy search, `[a]`-`[z]`
  letter shortcuts for DBs, create/drop database flows.

### Reducer changes

**None.** All the state transitions we need already exist:

- `TOGGLE_SIDEBAR` opens + focuses when called from a closed state.
- `PEEK_COLLECTION { delta: 1 }` with no active tab and no ephemeral
  creates a fresh ephemeral for collection 0 (existing logic).
- `DISCARD_EPHEMERAL_TAB` falls back gracefully when there's no
  pre-peek tab to restore (existing logic).
- `SET_COLLECTIONS` clamps the sidebar cursor and drops orphaned
  ephemerals (existing logic).

This is the appeal of building 053 + 054 first — 055 is almost pure
deletion + a small effect.

### Files

| File | Change |
|------|--------|
| `src/App.tsx` | Add `hasAutoLandedRef`, two effects (reset + land), update `showWelcome` condition, update `CollectionSidebar` render guard, drop step-2-only props passed to `WelcomeScreen` |
| `src/components/WelcomeScreen.tsx` | Delete step 2 code path, simplify props, possibly rename internal helpers |
| `specs/055-sidebar-first-landing.md` | This spec |
| `specs/README.md` | Add row |

Estimated diff: ~150 lines deleted (welcome step 2), ~30 lines added
(effects + ref). Net negative.

### Edge cases

- **Switch DB via palette**: `SELECT_DATABASE` clears `tabs`, then
  `SET_COLLECTIONS` lands. The reset effect fires (dbName changed), the
  land effect fires next render → fresh auto-peek of the new DB's
  collection 0. ✓
- **Drop the only collection in a DB while peeking it**:
  `SET_COLLECTIONS` (post-drop) drops the orphaned ephemeral via the
  spec 054 logic. We end up in `dbName set, no tabs, collections
  empty` — the auto-land effect sees `collections.length === 0` and
  opens the sidebar but doesn't peek. ✓
- **Auto-peek discarded with Esc**: ephemeral discarded, `activeTabId`
  becomes null, sidebar stays focused. The auto-land effect doesn't
  re-fire because the ref is set. The user resumes browsing with `j` /
  `k`, which re-creates an ephemeral via spec 054. ✓
- **URI specifies `db.col`**: `OPEN_TAB` for the URI collection happens
  before the user can interact. By the time `SET_COLLECTIONS` lands,
  `activeTabId` is set → auto-land effect short-circuits at the
  `state.activeTabId` guard. Sidebar stays closed (default). ✓
- **Race: `SET_COLLECTIONS` lands before `OPEN_TAB` for URI collection**:
  In theory the auto-peek could fire first, then `OPEN_TAB` discards the
  ephemeral. The user would see a brief flash of collection 0 before
  landing on their URI collection. If this manifests in practice, gate
  the effect on `state.collections.length > 0 && !somePendingUriOpen`
  via a second ref tracked from startup. **Verify during manual
  testing**; only fix if visible.
- **Welcome step 1 → DB pick**: `SELECT_DATABASE` fires from the welcome
  step 1 keyboard handler. dbName changes, reset effect clears ref,
  collections load, land effect fires. ✓

### Verification

Manual against a local Mongo with at least 3 collections in 2 DBs:

1. `monq --uri mongodb://localhost:27017` (no DB) → welcome step 1
   appears as today. Pick a DB.
2. After DB pick → sidebar appears expanded and focused on the left,
   first collection is auto-peeked (dim tab on top, doc list on right).
3. `j` → cursor advances, next collection peeks. `k` → cursor goes
   back. Cursor stays in sync with peek.
4. `Enter` → ephemeral promotes to a real tab, focus returns to doc
   list, sidebar stays visible. Tab bar shows the bright real tab.
5. `Esc` (from focused sidebar with active ephemeral) → ephemeral
   discarded, no tab open, sidebar still focused. Press `j` again →
   resumes browsing.
6. `Ctrl+P` → palette opens, "Switch Database" command works as today,
   picking a new DB triggers a fresh auto-peek of the new DB's first
   collection. ✓
7. `monq --uri mongodb://localhost:27017/shop` (DB only) → no welcome,
   sidebar opens + focuses + auto-peeks shop's first collection.
8. `monq --uri mongodb://localhost:27017/shop.users` (DB + collection)
   → no welcome, no auto-peek, lands directly in the users tab,
   sidebar stays closed.
9. Drop every collection in a DB from another client → `SET_COLLECTIONS`
   lands with `[]`, the orphaned ephemeral (if any) is dropped, sidebar
   stays open showing `(no collections)`.

### Open questions

- Should the sidebar still auto-open in the empty-DB case? See P1
  "Empty DB" — defaulting to yes. Easy to change later.
- Does the URI race condition (case 5 in edge cases) actually happen?
  Need to test.
