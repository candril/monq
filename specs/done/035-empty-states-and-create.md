# Empty States, Create Database, Create Collection

**Status**: Draft

## Description

Handle the case where a MongoDB server has no databases, or a database has no collections.
Rather than showing a perpetual "Loading..." spinner, display an explicit empty state with
an actionable option to create a database or collection directly from the welcome screen.

## Out of Scope

- Dropping databases or collections
- Creating collections with custom options (capped, schema validation, etc.)
- Creating indexes
- Any flow when documents are empty (already handled correctly)

---

## Capabilities

### P1 — Must Have

- When `listDatabases` returns an empty array, welcome screen step 1 shows an empty state
  message instead of "Loading..." — e.g. "No databases found"
- When `listCollections` returns an empty array, welcome screen step 2 shows an empty state
  message instead of "Loading..." — e.g. "No collections in <db>"
- Pressing `Tab` from either empty state (or any state) opens an inline name input
  (`n` conflicts with filter-as-you-type; `Ctrl+I` = `Tab` in terminals)
- Confirming the input creates the database (by creating a collection inside it) or creates
  the collection, then reloads and navigates into it automatically
- Empty name or Escape cancels the create flow without side effects
- Errors from the driver (e.g. invalid name, insufficient permissions) are shown inline
  below the input and leave the user in the create flow to correct the name

### P2 — Should Have

- `Tab` is available as a persistent shortcut even when the list is non-empty
- After a successful create, the new item is highlighted/selected in the list
- The hint row always shows `Tab  new` alongside the other shortcuts

### P3 — Nice to Have

- Name validation feedback while typing (e.g. flag illegal characters in MongoDB names
  before the user hits Enter)
- Auto-select the newly created item if it's the only one

---

## Technical Notes

### Root cause of the "Loading..." bug

In `WelcomeScreen.tsx` the `loading` flag is derived as:

```typescript
const loading = items.length === 0
```

An empty array from the server is therefore indistinguishable from "still fetching".
The fix is to thread a separate `isLoading` boolean through from state and use that
instead:

```typescript
// Before
const loading = items.length === 0

// After
const loading = isLoading  // prop driven by state.collectionsLoading / a new databasesLoading flag
```

### State additions

```typescript
// state.ts
databasesLoading: boolean   // true while listDatabases is in-flight
                            // (collectionsLoading already exists for step 2)
```

New actions:

| Action | Payload | Effect |
|--------|---------|--------|
| `SET_DATABASES_LOADING` | `{ loading: boolean }` | sets `databasesLoading` |
| `CREATE_DATABASE` | `{ name: string }` | dispatched by WelcomeScreen; handled by useMongoConnection |
| `CREATE_COLLECTION` | `{ name: string }` | dispatched by WelcomeScreen; handled by useMongoConnection |

### Create database flow

MongoDB has no explicit "create database" command. A database is created implicitly when
the first collection is written to it. The implementation creates a named collection to
materialise the database:

```typescript
async function createDatabase(dbName: string, firstCollection: string) {
  await client.db(dbName).createCollection(firstCollection)
}
```

When the user types a database name and confirms, a second prompt asks for the first
collection name (or a sensible default like `default` is used automatically — decide at
implementation time).

**Alternative** (simpler): prompt only for the database name, use a hidden sentinel
collection name (e.g. `_monq_init`), then delete it after creation. This keeps the UX
to a single prompt but is fragile. Prefer the two-prompt approach.

### Create collection flow

```typescript
async function createCollection(dbName: string, collectionName: string) {
  await client.db(dbName).createCollection(collectionName)
}
```

After creation, dispatch `SET_COLLECTIONS` with the refreshed list and open the new tab.

### WelcomeScreen empty state layout

Step 1 — no databases:

```
│                                                      │
│               No databases found                     │  textMuted
│                                                      │
│          ──────────────────────────                  │
│                                                      │
│    n  new database · q quit                          │  hint
```

Step 1 — with "new database" input open:

```
│               No databases found                     │
│                                                      │
│          New database name                           │  label (textMuted)
│          > myapp_                                    │  input (focused)
│          Enter confirm · Esc cancel                  │
│                                                      │
│    n  new database · q quit                          │
```

Step 2 — no collections (db already selected):

```
│               myapp  ›  No collections               │  textMuted
│                                                      │
│    n  new collection · ← back · q quit               │
```

### Interaction model additions

| Input | State | Behavior |
|-------|-------|----------|
| `Tab` | step 1 (any) | Open "New database" inline input |
| `Tab` | step 2 (any) | Open "New collection" inline input |
| `Enter` | create input, name non-empty | Run create, show spinner, then reload |
| `Escape` | create input open | Dismiss input, return to list |
| `Backspace` | create input empty | Same as Escape |

### Name validation (P3)

MongoDB database name rules: non-empty, no `/\. "$*<>:|?`, max 64 bytes.
Collection name rules: non-empty, no `$`, does not start with `system.`.
Show a brief inline warning (red text below input) on violation; do not block typing.

---

## File Structure

**Modified files:**
```
src/state.ts                    # databasesLoading flag; CREATE_DATABASE, CREATE_COLLECTION actions
src/hooks/useMongoConnection.ts # handle CREATE_DATABASE / CREATE_COLLECTION, set databasesLoading
src/components/WelcomeScreen.tsx # fix loading bug, empty state UI, inline create input
src/providers/mongodb.ts        # createDatabase(), createCollection() helpers
```
