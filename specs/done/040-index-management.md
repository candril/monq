# Index Management

**Status**: Done

## Description

Browse, create, and drop indexes on MongoDB collections directly from Monq. Index creation follows the same `$EDITOR` flow used for document editing and inserting — open a template, edit the definition, save to apply.

## Out of Scope

- Modifying an existing index in-place (drop + recreate is the MongoDB way)
- Index statistics / size reporting
- Atlas Search or vector indexes

## Capabilities

### P1 - Must Have

- **Index list view**: a panel or overlay listing all indexes on the current collection (name, key spec, options)
- **Create index**: open `$EDITOR` with a JSON template; save to call `createIndex()` with the parsed key spec and options
- **Drop index**: select an index in the list and drop it with a confirmation dialog
- Reload the index list after create or drop

### P2 - Should Have

- **Unique / TTL / sparse flags** pre-populated as comments in the editor template so they are easy to add
- **Error loop**: if the JSON is invalid, re-open the editor with an inline error comment (same pattern as document editing)
- Toast notification on success or failure

### P3 - Nice to Have

- Indicate which index is being used by the current query (hint from `explain()`)
- `explain.executionStats` shortcut from the index list

## Technical Notes

### MongoDB Driver API

```ts
// List indexes
const indexes = await collection.listIndexes().toArray()
// Each entry: { name: string, key: Record<string, 1 | -1 | "text" | ...>, unique?: boolean, ... }

// Create index
await collection.createIndex(keySpec, options)
// e.g. keySpec = { email: 1 }, options = { unique: true, name: "email_unique" }

// Drop index by name
await collection.dropIndex(indexName)
```

### Editor Template

The create-index temp file follows the same pattern as `edit.ts` / `editMany.ts`:

- Temp file: `$TMPDIR/monq/{collection}/index-{timestamp}.jsonc`
- Header comments describe the format (key spec + options)
- Body is a JSONC object with two top-level keys: `key` and `options`

Example template written to the editor:

```jsonc
// Monq — create index on {collection} @ {dbName}
// Save to apply (:wq). Quit without saving (:q!) to cancel.
//
// key    — field(s) and sort direction: { field: 1 } or { a: 1, b: -1 }
//          Special types: "text", "2dsphere", "hashed"
// options — name, unique, sparse, expireAfterSeconds, background, etc.

{
  "key": { "field": 1 },
  "options": {
    // "name": "my_index",
    // "unique": true,
    // "sparse": false,
    // "expireAfterSeconds": 3600
  }
}
```

### Error Retry Loop

Same pattern as `editDocument()` in `src/actions/edit.ts`:
- Parse the JSON after the editor closes
- If invalid, inject `// !! PARSE ERROR: …` at the top and re-open
- Empty file → cancelled (no-op)

### Index List Display

A new `IndexList` overlay component. It uses the same full-screen dim pattern as `CommandPalette` and `ConfirmDialog`: a `position="absolute" top={0} left={0} width="100%" height="100%"` box filled with `theme.overlayBg` covers the entire terminal (header, tabbar, and document list), with the panel centred on top via `justifyContent="center" alignItems="center"`.

The panel itself (`minWidth={72}`, `maxWidth="90%"`, `backgroundColor={theme.modalBg}`) contains:

1. **Title bar** — `Indexes — {collectionName}`, `theme.headerBg` background
2. **Scrollable list** — one row per index, `j`/`k` to navigate; selected row uses `theme.selection` background. Each row shows:
   - Index name (left, `theme.text` / `theme.textDim` when not selected)
   - Key spec (middle, serialised inline e.g. `{ email: 1 }`, `theme.textMuted`)
   - Flags if present (`unique`, `sparse`, `ttl` — right-aligned, `theme.secondary`)
3. **Key hint footer** — `theme.headerBg` background, same style as `ConfirmDialog`'s option bar:
   ```
   c create  x drop  Esc close
   ```

No search input — collections rarely have enough indexes to warrant fuzzy filtering.

- `j`/`k` to navigate the list
- `c` to create a new index (opens editor)
- `x` to drop the selected index (opens `ConfirmDialog`)
- `Escape` or `q` to close

### State

Minimal additions to `AppState`:
- `indexListVisible: boolean`
- `indexes: IndexInfo[]` (populated on open, reloaded after create/drop)
- `indexSelectedIndex: number`

```ts
export interface IndexInfo {
  name: string
  key: Record<string, unknown>
  unique?: boolean
  sparse?: boolean
  expireAfterSeconds?: number
  [key: string]: unknown
}
```

New `AppAction` variants:
- `OPEN_INDEX_LIST`
- `CLOSE_INDEX_LIST`
- `SET_INDEXES`
- `MOVE_INDEX`

## File Structure

| File | Change |
|------|--------|
| `src/actions/index.ts` | New — `listIndexes()`, `openEditorForCreateIndex()`, `dropIndex()` |
| `src/providers/mongodb.ts` | Add `listIndexes()`, `createIndex()`, `dropIndex()` |
| `src/components/IndexList.tsx` | New — overlay component showing the index list |
| `src/state.ts` | Add `indexListVisible`, `indexes`, `indexSelectedIndex`; add actions |
| `src/types.ts` | Add `IndexInfo` interface |
| `src/hooks/useKeyboardNav.ts` | Add `I` (shift+i) keybinding to open index list |
| `src/config/keymap.ts` | Add `index.open` action with default `shift+i` |
| `src/config/types.ts` | Add `"index.open"` to `ActionName` |

## Keyboard

| Key | Context | Action |
|-----|---------|--------|
| `Shift+I` | Document list | Open index list overlay |
| `j` / `k` | Index list | Navigate indexes |
| `c` | Index list | Create new index (open editor) |
| `x` | Index list | Drop selected index (with confirm) |
| `Escape` / `q` | Index list | Close overlay |
