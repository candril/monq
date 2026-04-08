# Document Marks (Letter-Based)

**Status**: Done

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

`'<letter>` writes a mark filter into **whichever query mode is currently active**, in a form the user can see and edit afterwards. The mechanism differs per mode but the keystroke is the same.

- **`'<letter>`** applies a mark filter for the given letter to the active query.
  - First press of `'` enters "jump to mark" mode (waits for a letter).
  - Pressing `a-z` writes the filter into the current query mode (see modes below).
  - **`''`** (a second `'` while jump-pending) clears any mark filter from the current query.
  - Pressing `Escape` cancels jump pending mode.

**Per-mode behaviour**:

- **Simple mode** (live, composable):
  - `'<letter>` toggles a `@<letter>` token in the simple query string and submits.
  - The token is resolved to `_id: { $in: [...] }` at parse time via the existing `parseSimpleQueryFull` path. Newly marked docs surface automatically on the next reload (live binding).
  - Composes naturally with other simple tokens: `@a Author:Peter +Name`.
  - `''` strips every `@<letter>` token from the query.

- **BSON mode** (snapshot):
  - `'<letter>` parses the current `bsonFilter`, sets `_id: { $in: [<EJSON-encoded ObjectIds>] }`, re-serialises with EJSON, and submits.
  - The ids are concrete at the moment `'<letter>` is pressed — newly marked docs require pressing `'<letter>` again to refresh.
  - Existing top-level keys are preserved; an existing `_id` constraint is overwritten (last-write-wins).
  - If the BSON filter is unparseable, a toast tells the user to fix it first; the filter is never silently destroyed.
  - `''` removes the `_id` key from the BSON filter (and clears the filter entirely if `_id` was the only key).

- **Pipeline mode** (snapshot, stage-aware):
  - `'<letter>` finds the first `$match` stage and sets `_id: { $in: [...] }` inside it. If no `$match` stage exists, prepends a new one.
  - Other keys in the existing `$match` are preserved; an existing `_id` is overwritten.
  - `''` strips `_id` from the first `$match`. If that leaves the stage empty, the whole stage is removed.

**EJSON note**: BSON mode now uses `EJSON.parse` and `EJSON.stringify` so ObjectId values round-trip as actual `ObjectId` instances (not raw `{$oid: …}` plain objects). This was a pre-existing gap in `parseBsonQuery` that surfaced when implementing per-mode mark filters and was fixed in the same change.

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

#### Why this matters

The mark filter doesn't filter the in-memory result set — it runs a fresh
query against MongoDB. This is critical because the user may have marked
documents earlier under a different query, paged past them, or be browsing a
large collection where the marked docs aren't currently loaded. By writing
into the active query (rather than overlaying a separate filter), the user
can compose the mark filter with everything else and the document loader's
existing query path handles it without special cases.

#### `@<letter>` simple-query token (P1)

The simple-mode behaviour of `'<letter>` is to write a `@<letter>` token into the query string. The parser then handles it. This is its own subsystem worth describing:

- Uses an `@` sigil rather than `marks:<letter>` so it can never collide with a user field literally called `marks`. Mirrors vim's `@a` (run macro from register `a`); symmetric with `'a` (jump to mark `a`).
- Parser detects `@<letter>` (single lowercase a-z only) and rewrites it to `_id: { $in: [...] }` at query-build time, ANDed with the rest of the parsed filter. Unknown letters resolve to an empty `$in` (matches nothing) — explicit "no marks for this letter" instead of silently dropping the constraint.
- Combines with all other simple-query token types: `@a +Name -State`, `@a status:active createdAt>2026-01-01`, etc.
- When both `@a` and `_id:...` appear in the same query, last-write wins (matches the parser's existing behaviour for repeated field tokens).
- Marks are resolved at parse time via an optional `markIds: Map<letter, ids[]>` argument to `parseSimpleQueryFull`. Call sites that have `AppState` build the map via `buildMarkIdMap(state)` (see `src/utils/query.ts`).
- `@a` resolution is also propagated through pipeline-template generation (Ctrl+F / Ctrl+E), so opening a `@a Author:Peter` query in the editor produces a `$match` with the resolved ids — not a silently dropped token.
- Uppercase letters (`@A-@Z`) and multi-char tokens (`@ab`) are not recognised — reserved for future use.
- Suggestions panel surfaces `@<letter>` entries when the user types `@`, listing each used register in the active scope with its doc count and the mark's color (see `FilterSuggestions.buildMarkRegisterSuggestions`).

### P2 — Should Have

- **List-marks overlay**: a small palette overlay that lists all used mark letters for the current collection with the count of docs each one tags. Selecting one applies that filter. Surfaced via a command palette entry (no dedicated key).
- **Command palette entries** (already implemented):
  - "Show marks for current collection" (opens the list-marks overlay) — pending the overlay component
  - "Clear all marks for current collection" — done
  - "Clear mark [letter]" — done
- **Toast on stale mark**: if a marked `_id` no longer exists when the filter runs, the filter still completes (it just returns fewer rows). After the result lands, prune the dangling id from storage and show `Pruned 2 stale marks`. The helper `pruneMarks(scope, ids)` exists in `src/utils/marks.ts` but is not yet wired — when `'<letter>` was mode-aware (via the dedicated override path) we pruned in `useDocumentLoader`; with the new design the prune logic needs to live somewhere mode-agnostic (probably as a post-fetch hook keyed on "this query came from a `@<letter>` resolution").

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
markPending: boolean // true after `m`, waiting for letter
jumpPending: boolean // true after `'`, waiting for letter
```

There is intentionally **no per-tab `activeMarkFilter` or saved-query state**.
The mark filter lives inside the active query itself (a `@<letter>` token in
simple mode, or a literal `_id: { $in: [...] }` in BSON / pipeline mode), so
the existing query plumbing handles it without any special state.

### State actions

```typescript
// src/state.ts
| { type: "ENTER_MARK_PENDING" }
| { type: "EXIT_MARK_PENDING" }
| { type: "ENTER_JUMP_PENDING" }
| { type: "EXIT_JUMP_PENDING" }
| { type: "SET_MARKS"; marks: MarkEntry[] }
```

There are no `ACTIVATE_MARK_FILTER` / `CLEAR_MARK_FILTER` actions. Both
`'<letter>` and `''` are dispatched via plain action helpers (`jumpToMark` /
`clearMarkJump` in `src/actions/marks.ts`) which compute the new query string
or pipeline, then dispatch the standard `SET_QUERY_INPUT` + `SUBMIT_QUERY` (or
`SET_PIPELINE`) actions. The reducer is unaware of marks beyond storing the
in-memory mark list via `SET_MARKS`.

### Query integration

The keyboard handler routes `'<letter>` to one of three pure helpers in
`src/query/markToken.ts`, depending on the active query mode:

| Mode     | Helper               | Produces                                                  |
| -------- | -------------------- | --------------------------------------------------------- |
| Simple   | `toggleMarkToken`    | New query string with `@<letter>` toggled in/out          |
| BSON     | `mergeMarkIntoBson`  | EJSON-encoded filter with `_id: { $in: [ObjectIds] }` set |
| Pipeline | `mergeMarkIntoPipeline` | New pipeline with `_id` set in the first `$match` stage |

Each helper is pure (no React, no async, no state). The action helper
(`jumpToMark`) calls the right one, then dispatches plain `SET_QUERY_INPUT` /
`SET_PIPELINE` + `SUBMIT_QUERY`. There is no document-loader special case;
the resulting query goes through the normal `resolveCurrentQuery` →
`fetchDocuments` path.

`''` (clear) routes through symmetric helpers: `removeAnyMarkToken`,
`removeIdFromBson`, `removeIdFromPipeline`.

**Live vs snapshot semantics**: only simple mode is live. The `@<letter>`
token resolves through `parseSimpleQueryFull` at every reload, so newly marked
docs surface on the next refresh. BSON and pipeline mode store concrete
ObjectIds — newly marked docs require pressing `'<letter>` again.

**EJSON in BSON mode**: `parseBsonQuery` was switched from plain `JSON.parse`
to `EJSON.parse` (with a `JSON.parse` fallback for backward compat) so that
`{"$oid":"…"}` extended-JSON forms deserialise to real `ObjectId` instances
the driver can match against. Without this, the BSON-mode mark filter would
write a syntactically-valid filter that returned zero rows.

### Keyboard wiring

In `useKeyboardNav.ts`, intercept `m` and `'` **before** the docHandlers table
(they need to enter pending state, not run a default action). Approximate sketch:

```typescript
// Pending modes win over everything except Escape
if (state.markPending) {
  if (key.name && /^[a-z]$/.test(key.name)) {
    const letter = key.name
    dispatch({ type: "EXIT_MARK_PENDING" })
    void toggleMarkOnSelection(state, dispatch, letter)
  } else {
    dispatch({ type: "EXIT_MARK_PENDING" })
  }
  return
}

if (state.jumpPending) {
  // `''` clears any mark filter from the current query mode.
  if (matches(key, keymap["mark.jump"])) {
    dispatch({ type: "EXIT_JUMP_PENDING" })
    clearMarkJump(state, dispatch)
    return
  }
  if (key.name && /^[a-z]$/.test(key.name)) {
    const letter = key.name
    dispatch({ type: "EXIT_JUMP_PENDING" })
    jumpToMark(state, dispatch, letter)
  } else {
    dispatch({ type: "EXIT_JUMP_PENDING" })
  }
  return
}

// Enter pending modes
if (matches(key, keymap["mark.set"]) && state.activeTabId) {
  dispatch({ type: "ENTER_MARK_PENDING" })
  return
}
if (matches(key, keymap["mark.jump"]) && state.activeTabId) {
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

| File                              | Change                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `src/utils/marks.ts`              | **New** — storage, canonical id, scope helpers, `decodeMarkId`, `pruneMarks`                          |
| `src/utils/marks.test.ts`         | **New** — round-trip + scope isolation tests                                                          |
| `src/query/markToken.ts`          | **New** — pure helpers: toggle/remove `@<letter>` (simple), merge/remove `_id` (BSON / pipeline)      |
| `src/query/markToken.test.ts`     | **New** — helper tests                                                                                |
| `src/actions/marks.ts`            | **New** — `toggleMarkOnSelection`, `jumpToMark`, `clearMarkJump`. All disk I/O lives here.             |
| `src/actions/palette/marks.ts`    | **New** — palette handlers for "Clear All Marks" and "Clear Mark [letter]"                            |
| `src/types.ts`                    | Add `marks`, `markPending`, `jumpPending` to `AppState`                                               |
| `src/state.ts`                    | New action types: `ENTER_*`, `EXIT_*` mark/jump pending, `SET_MARKS`                                   |
| `src/state/reducers/ui.ts`        | Handle pending-mode transitions                                                                       |
| `src/state/reducers/documents.ts` | Handle `SET_MARKS` (just stores the array)                                                            |
| `src/hooks/useKeyboardNav.ts`     | Intercept `m` and `'`, manage pending modes, route to `toggleMarkOnSelection` / `jumpToMark`          |
| `src/components/DocumentList.tsx` | Always-reserved 2-char mark gutter, header alignment                                                  |
| `src/components/FilterSuggestions.tsx` | `@<letter>` suggestions panel — color-coded, prefix-matched                                       |
| `src/theme.ts`                    | `MARK_PALETTE` + `getMarkColor()` (ported from presto)                                                |
| `src/App.tsx`                     | Load marks on startup; thread `marksForRow` and `markCounts` maps to `DocumentList` / suggestions     |
| `src/config/types.ts`             | Add `mark.set` and `mark.jump` to `ActionName`                                                        |
| `src/config/keymap.ts`            | Default bindings: `mark.set: ["m"]`, `mark.jump: ["'"]`                                               |
| `src/commands/builder.ts`         | Marks palette entries (only when there are marks in the active scope)                                 |
| `src/query/parser.ts`             | New `MarkIdMap` type and optional 3rd arg to `parseSimpleQueryFull`; `@<letter>` token recognition; `parseBsonQuery` switched to EJSON |
| `src/utils/query.ts`              | New `buildMarkIdMap(state)` helper; threads marks through `resolveCurrentQuery`                       |
| `src/state/reducers/pipeline.ts`  | `ENTER_PIPELINE_MODE` resolves `@<letter>` via `buildMarkIdMap`                                       |
| `src/actions/pipeline.ts`         | `_buildPipelineTemplate` / `writePipelineFile` / `openPipelineEditor` accept and propagate `markIds`  |

### Edge cases and pitfalls

- **Selected doc has no `_id`** (e.g. result of an aggregation pipeline that drops `_id`): show toast `Cannot mark — document has no _id` and do nothing. Don't crash.
- **Mark filter on pipeline tabs**: `'<letter>` injects `_id: { $in: [...] }` into the first `$match` stage (or prepends a new `$match` if none exists). Pipeline mode is unchanged otherwise — the user can still edit other stages. `''` strips `_id` from the first `$match`, removing the stage entirely if it becomes empty.
- **Mark filter on BSON tabs**: `'<letter>` parses the BSON filter, sets `_id: { $in: [...] }`, re-serialises with EJSON, and submits. Existing keys are preserved; an existing `_id` is overwritten. If the BSON is unparseable, a toast tells the user to fix it first; the filter is never silently destroyed.
- **Reload while mark filter active**: in simple mode this is live — newly marked docs from other sessions flow in via `parseSimpleQueryFull`'s next call to `buildMarkIdMap`. In BSON / pipeline mode the ids are concrete and frozen at the moment `'<letter>` was pressed; the user must press `'<letter>` again to refresh.
- **Letter collision with vim-style motions**: presto uses `m` for mark and `'` for jump exactly because of vim parity. Both keys are currently free in monq's keymap (see `DEFAULT_BINDINGS`). No conflict.
- **`m` while in selection mode**: `m` still enters mark pending mode. In selection mode, `m<letter>` marks **all** selected rows with that letter. Toggle semantics: if every selected row already has that letter, remove from all; otherwise set on all. Selection mode is dropped after the mark op completes (same as bulk delete flow).
- **Marking inside the welcome screen / collection picker**: ignore — only active in the documents view (mirrors how other doc-view actions are gated).

---

## Keyboard summary

| Key                              | Action                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `m<letter>`                      | Toggle mark `<letter>` on selected doc (or selected rows)                            |
| `'<letter>`                      | Apply mark filter to the current query mode (toggle in simple, set in BSON/pipeline) |
| `''`                             | Clear any mark filter from the current query                                         |
| `@<letter>` (simple query token) | Mark register — composes with other filter tokens                                    |
| `Escape` (during pending mode)   | Cancel mark/jump pending                                                             |

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
