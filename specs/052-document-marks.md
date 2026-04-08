# Document Marks (Letter-Based)

**Status**: Draft

## Description

Lightweight per-collection bookmarks for individual documents, inspired by vim
marks (and presto's letter-based PR marks — see `../presto/specs/028-mark-categories.md`).

Press `m` then a letter (`a-z`) to tag the currently selected document with that
letter. Press `'` then the same letter to filter the collection down to only the
documents tagged with that letter. Pressing `m<letter>` again on an already-tagged
document **toggles** the mark off.

The goal is to give users a fast, ad-hoc way to "remember" a handful of
interesting documents while exploring a large collection — without polluting the
data, without writing a query, and without needing to remember `_id`s.

Marks are scoped **per collection** (within the current database/host context).
A mark `a` in `users` is independent from a mark `a` in `orders`.

## Out of Scope

- Multi-mark per document (one letter per document; re-marking with a new letter replaces the old one — same model as presto)
- Cloud / cross-machine sync of marks
- Uppercase letter marks (`A-Z` reserved for future use, e.g. global marks across collections)
- Marks on aggregation pipeline results that don't carry `_id` (e.g. `$group` output) — out of scope; the doc must have an `_id` to be markable
- Visual gutter column with mark colours (presto-style fixed-letter palette) — could be revisited in P3 if marks become heavily used
- Marks on documents that haven't been loaded yet (you can only mark what's currently in the result set; the filter, however, can still surface previously marked docs from elsewhere in the collection — see "Filter behaviour" below)

---

## Capabilities

### P1 — Must Have

#### Setting a mark

- **`m<letter>` toggles a mark** on the currently selected document.
  - First press of `m` enters "mark pending" mode (waits for a letter).
  - Pressing `a-z` while in mark pending mode tags the selected doc with that letter.
  - Pressing the **same letter** that's already on the document removes the mark (toggle off).
  - Pressing a **different letter** replaces the existing mark (each doc has at most one mark).
  - Pressing `Escape` or any non-letter key in mark pending mode cancels.
  - Toast feedback: `Marked [a]` / `Unmarked [a]` / `Replaced [b] → [a]`.

#### Filtering by mark

- **`'<letter>`** shows only documents marked with that letter in the current collection.
  - First press of `'` enters "jump to mark" mode (waits for a letter).
  - Pressing `a-z` activates the filter (queries the collection for those `_id`s).
  - Pressing `'` while the same letter's filter is already active toggles it off.
  - **`''`** (a second `'` while jump-pending) clears the active mark filter and restores the previous query. A lone `'` always waits for a letter, so this is the only one-handed way to clear.
  - Pressing `Escape` cancels jump pending mode.
  - The filter must coexist with — but visually replace — the current simple/pipeline query while active. Restoring (via `''`, `query.clear`, etc.) brings the previous query back.

#### Persistence and scope

- Marks persist across sessions in `~/.local/share/monq/marks` (XDG, alongside `history`).
- Storage scope is **`host:db:collection`**. Two collections with the same name on different hosts/dbs do **not** share marks.
- Document identity = `_id` serialised to its canonical string form (`ObjectId.toHexString()` for `ObjectId`, otherwise `EJSON.stringify` of the `_id`).
- Marks survive across reloads, tab close/reopen, and app restart.

#### Visual indicator

- Marked documents show a single-character marker in a **2-char gutter** (1 char letter + 1 char gap) prepended to the row, left of the existing content.
- Unmarked rows leave the gutter blank (so columns stay aligned).
- The gutter character is the **letter itself** (`a`, `b`, …), color-coded from a fixed Catppuccin Mocha palette — **same approach as presto** (`../presto/src/theme.ts` `MARK_PALETTE` / `getMarkColor`). Each letter is deterministically mapped to a colour by index (`a → red`, `b → peach`, `c → yellow`, …), cycling through the palette for letters beyond its length. The mapping is stable so the same letter always renders the same colour everywhere it appears.
- The gutter is **always reserved** in the documents view. The original draft of this spec proposed collapsing it to zero width when no marks existed, but that caused a jarring layout shift the moment the user set their first mark (every column moved 2 chars right). Reserving the 2 chars permanently is a cheap price for a stable layout.

#### Filter behaviour (the surprising bit)

When the user activates `'<letter>`, monq does **not** filter the in-memory result
set. It runs a fresh query against MongoDB:

```js
db.<collection>.find({ _id: { $in: [<all _ids marked with letter>] } })
```

This is important because the user may have marked documents earlier under a
different query, paged past them, or be browsing a large collection where the
marked docs aren't currently loaded. The mark filter must surface them
regardless of the current query state.

Implementation: the existing `pipelineMode` / simple-query plumbing already
supports running an arbitrary filter, so the mark filter is just another filter
source — see Technical Notes.

### P2 — Should Have

> **Note on `''`**: P1 reassigns `''` to "clear active mark filter" because that's the only one-handed way to undo a filter (a lone `'` always opens jump pending). The "list used marks" overlay therefore needs a different entry point — most likely a command palette entry, since the keyboard space around `'` is now spoken for.

- **List-marks overlay**: a small palette overlay that lists all used mark letters for the current collection with the count of docs each one tags. Selecting one applies that filter. Surfaced via a command palette entry (no dedicated key) — see below.
- **`marks:<letter>`** filter token in the simple query bar — equivalent to `'<letter>` but composable with other tokens (e.g. `marks:a Author:Peter`).
  - Parser detects `marks:<letter>` and rewrites it to `_id: { $in: [...] }` at query-build time, ANDed with the rest of the parsed filter.
- **Command palette entries**:
  - "Show marks for current collection" (opens the list-marks overlay)
  - "Clear all marks for current collection"
  - "Clear mark [letter]"
- **Toast on stale mark**: if a marked `_id` no longer exists when the filter runs, the filter still completes (it just returns fewer rows). After the result lands, prune the dangling id from storage and show `Pruned 2 stale marks`. The helper `pruneMarks(scope, ids)` already exists in `src/utils/marks.ts`; the loader needs to compare returned `_id`s against the requested set and call it.

### P3 — Nice to Have

- **Mark mode key hint** in the status bar when `m` or `'` is pending: `mark: _` or `jump: _`.
- **Yank marked**: `Y` while a mark filter is active yanks all currently visible marked docs as a JSON array (already covered by existing `selection.select_all` + `Y`, but worth documenting).
- **Migration** of old single-mark format if we ever ship a P0 boolean version first — not relevant since we're going letter-based from day one.

---

## Technical Notes

### Storage schema

A new file `~/.local/share/monq/marks` (JSON-lines, same shape as `history`):

```jsonc
{"host":"mongodb://localhost:27017","db":"shop","col":"orders","id":"507f1f77bcf86cd799439011","letter":"a"}
{"host":"mongodb://localhost:27017","db":"shop","col":"orders","id":"507f1f77bcf86cd799439012","letter":"a"}
{"host":"mongodb://localhost:27017","db":"shop","col":"users","id":"alice@example.com","letter":"r"}
```

- `host` is the connection host string from `state.host`.
- `db` is `state.dbName`.
- `col` is the active tab's `collectionName`.
- `id` is the canonical string form of `_id` (see `markDocId()` below).
- `letter` is a single lowercase `a-z` character.

Each `(host, db, col, id)` tuple has at most one row — re-marking with a new
letter rewrites the row, and toggling off deletes it. Capping is not necessary
(marks are user-driven and finite); but a soft cap of e.g. 5_000 entries can be
applied to keep file I/O bounded.

### `src/utils/marks.ts` (new)

```typescript
export interface MarkEntry {
  host: string
  db: string
  col: string
  id: string
  letter: string
}

/** Canonical id string for storage. ObjectId → hex; everything else → EJSON. */
export function markDocId(id: unknown): string

/** Load all marks from disk. Returns [] on any error. */
export async function loadMarks(): Promise<MarkEntry[]>

/** Set/replace/toggle a mark. Returns the new state. */
export async function setMark(scope: MarkScope, id: string, letter: string): Promise<MarkEntry[]>

/** Delete a mark by scope+id (used by toggle-off). */
export async function clearMark(scope: MarkScope, id: string): Promise<MarkEntry[]>

/** Clear every mark for a given scope. */
export async function clearAllMarks(scope: MarkScope): Promise<MarkEntry[]>

/** Get all marks for a scope, indexed by id. */
export function marksForScope(all: MarkEntry[], scope: MarkScope): Map<string, string>

/** Get all ids for a (scope, letter) pair. */
export function idsForLetter(all: MarkEntry[], scope: MarkScope, letter: string): string[]

/** Get all letters used in a scope, with counts. */
export function lettersInScope(all: MarkEntry[], scope: MarkScope): Map<string, number>

export interface MarkScope {
  host: string
  db: string
  col: string
}
```

`markDocId()` keeps the marks file format independent of BSON types so that
loading marks for a collection whose docs use string `_id`s, ObjectId `_id`s, or
compound `_id`s all work uniformly.

### App state additions

```typescript
// src/types.ts (AppState)

/** All marks loaded from disk at startup. */
marks: MarkEntry[]

/** Mark/jump pending modes — exclusive. */
markPending: boolean       // true after `m`, waiting for letter
jumpPending: boolean       // true after `'`, waiting for letter

/** Active mark filter on the current tab — null when not filtering by mark. */
activeMarkFilter: string | null  // e.g. "a"

/** Saved query to restore when the mark filter is cleared. */
markFilterSavedQuery: { query: string; mode: QueryMode } | null
```

`activeMarkFilter` and `markFilterSavedQuery` likely belong on the `Tab` rather
than top-level `AppState`, so each tab can independently filter by a mark.
Suggested placement on `Tab`:

```typescript
// src/types.ts (Tab)
activeMarkFilter: string | null
markFilterSavedQuery: { query: string; mode: QueryMode } | null
```

### State actions

```typescript
// src/state.ts
| { type: "ENTER_MARK_PENDING" }
| { type: "EXIT_MARK_PENDING" }
| { type: "ENTER_JUMP_PENDING" }
| { type: "EXIT_JUMP_PENDING" }
| { type: "SET_MARKS"; marks: MarkEntry[] }
| { type: "TOGGLE_MARK"; letter: string }                // sets/clears on selected doc
| { type: "ACTIVATE_MARK_FILTER"; letter: string }
| { type: "CLEAR_MARK_FILTER" }
```

`TOGGLE_MARK` reads the selected doc's `_id` from `state.documents[state.selectedIndex]`,
computes the `MarkScope` from `state.host` / `state.dbName` / active tab's
`collectionName`, calls `setMark` or `clearMark`, dispatches `SET_MARKS` with
the new in-memory snapshot, and surfaces a toast.

### Query integration

The mark filter is implemented as a special filter source that overrides the
tab's regular query while active. When `ACTIVATE_MARK_FILTER` fires:

1. Save the current `query` + `queryMode` into `markFilterSavedQuery`.
2. Build a filter `{ _id: { $in: ids } }` where `ids` come from
   `idsForLetter(state.marks, scope, letter)` — converted from canonical strings
   back to `ObjectId` (or other native types) using a small inverse helper.
3. Dispatch a regular `SET_QUERY` (or equivalent) that runs the find with that
   filter. The simplest hookup is to switch the tab into BSON mode with
   `bsonFilter` set to the JSON form, since BSON mode already supports arbitrary
   `_id` filters cleanly. Alternatively, add an explicit `tab.markFilter` field
   that the document loader checks before falling back to the user's query.

Spec authors should pick whichever hookup is least invasive after reading
`useDocumentLoader.ts` — both options are viable.

When `CLEAR_MARK_FILTER` fires, restore `query` + `queryMode` from
`markFilterSavedQuery`, clear it, and reload.

### Keyboard wiring

In `useKeyboardNav.ts`, intercept `m` and `'` **before** the docHandlers table
(they need to enter pending state, not run a default action). Approximate sketch:

```typescript
// Pending modes win over everything except Escape
if (state.markPending) {
  if (key.name === "escape" || !/^[a-z]$/.test(key.name ?? "")) {
    dispatch({ type: "EXIT_MARK_PENDING" })
    return
  }
  dispatch({ type: "TOGGLE_MARK", letter: key.name! })
  dispatch({ type: "EXIT_MARK_PENDING" })
  return
}

if (state.jumpPending) {
  if (key.name === "escape") {
    dispatch({ type: "EXIT_JUMP_PENDING" })
    return
  }
  if (!/^[a-z]$/.test(key.name ?? "")) {
    dispatch({ type: "EXIT_JUMP_PENDING" })
    return
  }
  // If already filtering by this letter, clear; otherwise activate.
  const tab = activeTab(state)
  if (tab?.activeMarkFilter === key.name) {
    dispatch({ type: "CLEAR_MARK_FILTER" })
  } else {
    dispatch({ type: "ACTIVATE_MARK_FILTER", letter: key.name! })
  }
  dispatch({ type: "EXIT_JUMP_PENDING" })
  return
}

// Enter pending modes
if (matches(key, keymap["mark.set"])) {       // default: m
  dispatch({ type: "ENTER_MARK_PENDING" })
  return
}
if (matches(key, keymap["mark.jump"])) {      // default: '
  dispatch({ type: "ENTER_JUMP_PENDING" })
  return
}
```

Two new entries in `ActionName` (`src/config/types.ts`) and
`DEFAULT_BINDINGS` (`src/config/keymap.ts`):

```typescript
"mark.set": ["m"],
"mark.jump": ["'"],
```

Note: `m` is currently unbound. `'` is currently unbound. No conflicts.

### DocumentList gutter

`DocumentList.tsx` already builds rows via `buildRowSegments`. Add an optional
1-char prefix segment per row when `showMarkGutter` is true. The component
receives a `Map<docKey, letter>` prop derived in `App.tsx` from
`marksForScope(state.marks, currentScope)` and looked up per row by computing
each doc's canonical id with `markDocId()`.

The gutter colour comes from a deterministic per-letter palette ported from
presto. Add to `src/theme.ts`:

```typescript
/**
 * Fixed colour palette for mark letters. Each letter always maps to the same
 * colour (a → red, b → peach, …), cycling for letters past the palette.
 * Catppuccin Mocha — matches presto's `MARK_PALETTE` exactly.
 */
const MARK_PALETTE = [
  "#f38ba8", // red
  "#fab387", // peach
  "#f9e2af", // yellow
  "#a6e3a1", // green
  "#94e2d5", // teal
  "#89dceb", // sky
  "#89b4fa", // blue
  "#cba6f7", // mauve
]

export function getMarkColor(letter: string): string {
  const index = letter.charCodeAt(0) - "a".charCodeAt(0)
  return MARK_PALETTE[index % MARK_PALETTE.length]
}
```

```tsx
// Pseudocode in DocumentRow
const markLetter = marksForRow.get(markDocId(doc._id))
const gutter = markLetter
  ? { text: markLetter, color: getMarkColor(markLetter) }
  : { text: " ", color: theme.bg }
const segments = [gutter, { text: " ", color: theme.bg }, ...rowSegments]
```

`HeaderRow` gets a matching 2-char left padding so headers stay aligned with
data when the gutter is visible.

The gutter is hidden entirely if `marksForRow.size === 0`, to avoid taking up
horizontal space when the user isn't using marks in the current collection.

### Status bar / pending mode hint

When `markPending` or `jumpPending` is true, show a transient hint in the
toast/status area: `mark: _` or `jump to mark: _`. Cancelled on the next keypress.

### File structure

| File | Change |
|---|---|
| `src/utils/marks.ts` | **New** — storage, canonical id, scope helpers |
| `src/utils/marks.test.ts` | **New** — round-trip + scope isolation tests |
| `src/types.ts` | Add `marks`, `markPending`, `jumpPending` to `AppState`; add `activeMarkFilter`, `markFilterSavedQuery` to `Tab` |
| `src/state.ts` | New action types + router entries |
| `src/state/reducers/ui.ts` | Handle pending-mode transitions |
| `src/state/reducers/tabs.ts` | Handle `ACTIVATE_MARK_FILTER` / `CLEAR_MARK_FILTER` per-tab |
| `src/state/reducers/documents.ts` | Handle `SET_MARKS` (just stores the array) |
| `src/hooks/useKeyboardNav.ts` | Intercept `m` and `'`, manage pending modes |
| `src/hooks/useDocumentLoader.ts` | When `tab.activeMarkFilter` is set, run `{ _id: { $in: [...] } }` instead of the regular query |
| `src/components/DocumentList.tsx` | Optional 1-char mark gutter, header alignment |
| `src/theme.ts` | `MARK_PALETTE` + `getMarkColor()` (ported from presto) |
| `src/App.tsx` | Load marks on startup; thread `marksForScope` map down to `DocumentList`; show pending hints |
| `src/config/types.ts` | Add `mark.set` and `mark.jump` to `ActionName` |
| `src/config/keymap.ts` | Default bindings: `mark.set: ["m"]`, `mark.jump: ["'"]` |
| `src/commands/...` | P2: command palette entries for "show marks", "clear all marks", "clear mark [letter]" |
| `src/query/parser.ts` | P2: parse `marks:<letter>` token (resolves to `_id: { $in: [...] }` at query-build time, requires marks map at parse time — pass through `parseSimpleQuery` options) |

### Edge cases and pitfalls

- **Selected doc has no `_id`** (e.g. result of an aggregation pipeline that drops `_id`): show toast `Cannot mark — document has no _id` and do nothing. Don't crash.
- **Mark filter on aggregation tabs**: if `tab.pipelineMode` is true when `'<letter>` is pressed, the mark filter takes over (saves the pipeline source the same way it saves the simple query) and switches the tab to a temporary find. Clearing the mark filter restores the pipeline.
- **Reload while mark filter active**: `r` (`doc.reload`) re-runs the find with the same `_id: { $in: [...] }` — i.e. it picks up newly marked docs from other sessions on disk if `loadMarks()` is called as part of reload, otherwise stays stable. Recommended: re-read the marks file on `doc.reload` so cross-tab/cross-session updates flow in.
- **Letter collision with vim-style motions**: presto uses `m` for mark and `'` for jump exactly because of vim parity. Both keys are currently free in monq's keymap (see `DEFAULT_BINDINGS`). No conflict.
- **`m` while in selection mode**: `m` should still enter mark pending mode — but since selection mode marks multiple rows, we have a choice:
  - **P1 behaviour:** in selection mode, `m<letter>` marks **all** selected rows with that letter. Toggle semantics: if every selected row already has that letter, remove from all; otherwise set on all. This is the most useful behaviour and requires no extra UI.
  - Cancel selection mode after the mark op completes (same as bulk delete flow).
- **Marking inside the welcome screen / collection picker**: ignore — only active in the documents view (mirrors how other doc-view actions are gated).

---

## Keyboard summary

| Key | Action |
|---|---|
| `m<letter>` | Toggle mark `<letter>` on selected doc (or selected rows) |
| `'<letter>` | Filter to docs marked `<letter>` in the current collection |
| `''` | Clear active mark filter, restore previous query |
| `'<same letter>` | Toggle the active filter off (same as `''` when the letter matches the current filter) |
| `Escape` (during pending mode) | Cancel mark/jump pending |

## UX notes

```
shop.orders                                    docs 1234 / 1234
─────────────────────────────────────────────────────────────────
a  6512abcd…  Alice    paid     2026-04-01   $129.00
   6512abce…  Bob      pending  2026-04-02   $44.50
b  6512abcf…  Carol    paid     2026-04-02   $310.00
a  6512abd0…  Dave     refunded 2026-04-03   $0.00
   6512abd1…  Eve      paid     2026-04-04   $89.20
─────────────────────────────────────────────────────────────────
mark: _                                                  (m pending)
```

```
shop.orders   ' a                                   docs 2 / 1234
─────────────────────────────────────────────────────────────────
a  6512abcd…  Alice    paid     2026-04-01   $129.00
a  6512abd0…  Dave     refunded 2026-04-03   $0.00
─────────────────────────────────────────────────────────────────
filter: marks:a (press '' to clear)
```
