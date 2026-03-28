# Database Switcher

**Status**: Ready

## Description

When no database is specified in the connection URI (e.g. `mongodb://localhost:27017`), Mon-Q automatically opens the command palette in database-picker mode so the user can choose one before seeing any collections. A `Switch Database` command in the normal palette lets the user change the active database at any time, which closes all open tabs and reloads the collection list from scratch.

## Out of Scope

- Persisting the last-used database across sessions
- Connecting to multiple databases simultaneously
- Renaming or dropping databases

## Capabilities

### P1 - Must Have

- **DB picker on startup** — if `parseUri` returns an empty `dbName`, Mon-Q opens the command palette in `"databases"` mode immediately after the connection is established (instead of showing an empty collection list).
- **`Switch Database` command** — a command in the palette (category `"navigation"`) labelled `Switch Database`. Selecting it switches the palette to `"databases"` mode, populated by `listDatabases()`.
- **Palette databases mode** — mirrors the existing `"collections"` mode: fuzzy-searchable list, `j/k` / arrows to navigate, `Enter` to confirm, `Escape` to cancel (no-op on startup when no db is yet selected). Placeholder reads `Switch database...`.
- **On database selected** — calls `switchDatabase(dbName)`, dispatches `SELECT_DATABASE`, closes palette. `SELECT_DATABASE` closes all tabs, clears collections, sets `state.dbName`, then triggers a collection reload.
- **Provider support** — expose `listDatabases(): Promise<string[]>` and `switchDatabase(dbName: string): void` in `providers/mongodb.ts`.

### P2 - Should Have

- **Header reflects current db** — `Header.tsx` already reads `state.dbName`; no change needed as long as `SELECT_DATABASE` updates it.
- **Escape behaviour** — if no database has been selected yet (startup flow), `Escape` in the databases palette is swallowed (must pick). After a db is active, `Escape` dismisses and leaves current db unchanged.
- **Error on empty list** — if `listDatabases` fails or returns zero entries, show a toast / error message instead of a blank palette.

### P3 - Nice to Have

- **Highlight current db** in the picker list when triggered from the palette (after one has already been selected).

## Technical Notes

### Palette mode extension

`App.tsx` already has:

```ts
type PaletteMode = "commands" | "collections"
```

Extend to:

```ts
type PaletteMode = "commands" | "collections" | "databases"
```

The `databases` mode populates the palette with one `Command` per database name:

```ts
// commands/databases.ts
export function buildDatabaseCommands(databases: string[]): Command[] {
  return databases.map((db) => ({
    id: `db:${db}`,
    label: db,
    category: "database",
  }))
}
```

`handlePaletteSelect` in `App.tsx` handles `cmd.id.startsWith("db:")` — same pattern as `"open:"` for collections.

### Startup flow

In `useMongoConnection`, after `init(uri)`:

1. If `dbName` is non-empty, proceed as today (`listCollections()`).
2. If `dbName` is empty, call `listDatabases()`, store result in state (`SET_DATABASES`), and dispatch `OPEN_DB_PICKER`. `App.tsx` responds by setting `paletteMode = "databases"` and opening the palette.

### New state / actions

```ts
// state.ts
| { type: "SET_DATABASES"; databases: string[] }
| { type: "OPEN_DB_PICKER" }
| { type: "SELECT_DATABASE"; dbName: string }
```

`SELECT_DATABASE` reducer:
- Calls `switchDatabase(dbName)` (side effect via a passed-in thunk, or handled in `App.tsx` before dispatch)
- Sets `state.dbName`
- Resets: `tabs: [], activeTabId: null, closedTabs: [], collections: [], collectionsLoading: true`
- Sets `view: "collections"`

`useMongoConnection` watches `state.dbName` changes (or a dedicated `reloadCollectionsCounter`) to re-run `listCollections()`.

### Provider changes

```ts
// providers/mongodb.ts

let activeDb: string | null = null

export function listDatabases(): Promise<string[]> {
  return client!.db().admin().listDatabases()
    .then(r => r.databases.map(d => d.name).sort())
}

export function switchDatabase(dbName: string): void {
  activeDb = dbName
}

// Update getDb():
function getDb(): Db {
  if (!client) throw new Error("Not connected")
  return client.db(activeDb ?? undefined)
}

// Update init() to accept optional initial db:
export function init(uri: string, dbName?: string): void {
  client = new MongoClient(uri, { ... })
  if (dbName) activeDb = dbName
}
```

`parseUri` already extracts `dbName`; pass it to `init()` so `getDb()` uses it from the start.

### CATEGORY_ORDER update

Add `"database"` to `CATEGORY_ORDER` in `commands/types.ts` (above `"collection"` or at top alongside `"navigation"`).

## File Structure

| File | Change |
|------|--------|
| `src/providers/mongodb.ts` | Add `listDatabases`, `switchDatabase`; update `getDb`, `init` |
| `src/types.ts` | Add `databases: string[]` to `AppState` |
| `src/state.ts` | Add `SET_DATABASES`, `OPEN_DB_PICKER`, `SELECT_DATABASE` actions + reducers |
| `src/hooks/useMongoConnection.ts` | Call `listDatabases` when URI has no db; watch `state.dbName` for re-loading collections |
| `src/App.tsx` | Extend `PaletteMode` to `"databases"`; handle `db:` commands; handle `OPEN_DB_PICKER` |
| `src/commands/databases.ts` | New: `buildDatabaseCommands(databases)` |
| `src/commands/builder.ts` | Add `nav:switch-database` command |
| `src/commands/types.ts` | Add `"database"` to `CATEGORY_ORDER` |
