---
title: Usage
description: Connecting to MongoDB and navigating your data with monq.
---

## Connect to a database

Pass a MongoDB connection URI with `--uri`:

```sh
monq --uri <mongodb-uri>
```

### Examples

```sh
# Local database
monq --uri mongodb://localhost:27017/mydb

# Atlas cluster
monq --uri "mongodb+srv://user:pass@cluster.mongodb.net/mydb"

# Let monq pick the database interactively
monq --uri mongodb://localhost:27017

# Show saved connections (or URI prompt if none configured)
monq
```

If no database is included in the URI, monq displays a database picker on startup. You can also switch databases at any time with `Ctrl+P`.

## Managing databases and collections

### From the welcome screen

When on the database or collection picker:

- **Tab** — Create a new database or collection via an inline form
- **Ctrl+D** — Drop the selected database or collection (requires typing the exact name to confirm)
- **Ctrl+R** — Rename the selected collection (step 2 only, pre-fills current name)

When viewing a collection list:
- If the list is empty, **Ctrl+D** drops the current database
- If collections exist, **Ctrl+D** drops the selected collection

### From the command palette

Press **Ctrl+P** to open the command palette and search for:

- **Create Collection** — Creates a new collection in the current database
- **Rename Collection: [name]** — Renames the collection in the current tab (pre-fills current name)
- **Drop Current Database** — Drops the currently active database (requires typing the exact name)
- **Drop Collection: [name]** — Drops the collection in the current tab (requires typing the exact name)

All drop operations show a confirmation dialog requiring you to type the exact name before proceeding — there's no accidental deletion.

## Saved connections

If you have [saved connection profiles](/monq/reference/configuration/#connections) in `~/.config/monq/config.toml`, monq shows a connection picker on startup instead of the URI prompt. Type to fuzzy-filter the list, then press `Enter` to connect.

Press `Tab` from the connection picker to enter a custom URI instead.

## Query modes

monq supports three ways to query a collection:

| Mode | How to activate | Best for |
|------|----------------|----------|
| **Simple** | `/` to open query bar | Quick key:value filters |
| **BSON JSON** | `Tab` from simple mode | Raw MongoDB query objects |
| **Pipeline** | `Tab` again, or `Ctrl+F` | Aggregation pipelines |

See [Query Syntax](/monq/reference/query-syntax/) for the full simple mode reference.

## Query history

Press `Ctrl+R` while the query bar is open to browse past queries in a fuzzy picker. History is persisted to disk (`~/.local/share/monq/history`) and survives across sessions.

History is **scoped per collection** — each `(database, collection)` pair has its own history, since the schema and useful filters are usually different. Switching tabs gives you a different history list.

## Navigating results

Use vim-style keys to move through results:

- `j` / `k` — row down / up
- `h` / `l` — column left / right
- `Ctrl+D` / `Ctrl+U` — scroll half page

Open the command palette with `Ctrl+P` for quick actions, or press `q` to quit.

See the full [Key Bindings reference](/monq/reference/key-bindings/).

## Collection tabs

Open multiple collections at once with `t` (clone tab) or by switching after `Ctrl+P`. Switch between open tabs with `1`–`9`, `[`, and `]`.

## Editing documents

- `e` — edit the document under the cursor in `$EDITOR`
- `v` then `Space` to select rows, then `e` — bulk edit as a JSON array
- `i` — insert a new document
- `Shift+I` — manage indexes (edit all in `$EDITOR`)
- `Shift+D` — delete selected documents (with confirmation)

## Marks

Vim-style letter marks let you bookmark a handful of documents while exploring a collection — without polluting the data, writing a query, or remembering `_id`s. Marks are scoped per `(host, db, collection)` and persist to `~/.local/share/monq/marks`.

### Setting marks

Press `m` followed by any lowercase letter `a–z` to toggle that mark on the selected document. The mark appears as a colored letter in the leftmost gutter.

- `ma` — tag the current doc with letter `a`
- `mb` — tag with `b` (replaces `a` if the doc was already marked)
- `ma` again — toggle the mark off
- In selection mode (`v`), `m<letter>` marks **all** selected rows at once

Each letter has a stable color (`a` red, `b` peach, `c` yellow, …) so the same letter looks the same everywhere it appears.

### Filtering by mark

Press `'` (apostrophe) followed by a letter to filter the current collection to only the documents tagged with that letter. The filter is written into your active query mode in a form you can see and edit afterwards:

- **Simple mode**: toggles a `@<letter>` token in the query bar. Composes naturally with other tokens — `@a Author:Peter` filters to "marked-with-a AND Author=Peter".
- **BSON mode**: sets `_id: { $in: [...] }` in the BSON filter (literal ObjectIds).
- **Pipeline mode**: merges `_id: { $in: [...] }` into the first `$match` stage (or prepends one).

The simple-mode token is **live** — newly-marked docs surface on the next reload. BSON and pipeline modes snapshot the resolved ids at the moment `'<letter>` is pressed; press it again to refresh.

Press `''` (two apostrophes) to clear the mark filter from the current query.

### Listing marks

Type `@` in the simple query bar — the suggestion panel lists every used register in the active collection, with the doc count and the mark's color. Selecting one inserts the token (you can keep typing to compose with other filters before submitting).

### Managing marks

The command palette (`Ctrl+P`) exposes:

- **Clear All Marks (current collection)** — removes every mark in the active collection
- **Clear Mark [a] (3 docs)** — one entry per used letter, with the count

These entries only appear when you have marks in the active collection.

## Managing indexes

Press `Shift+I` to open all indexes on the current collection in `$EDITOR` as a live editable JSON array:

```jsonc
{
  "$schema": "./.monq-index-schema.json",
  "indexes": [
    {
      "key": { "_id": 1 },
      "options": { "name": "_id_" }
    },
    {
      "key": { "email": 1 },
      "options": { "name": "email_1", "unique": true }
    }
  ]
}
```

**Add** a new entry to create an index, **remove** an entry to drop it, or **edit** an entry to replace it (drop + recreate). Field names autocomplete from the collection's schema via the JSON Schema sidecar. After saving, monq shows a confirmation dialog listing what will be created, dropped, or replaced.

Available options: `name` (required), `unique`, `sparse`, `expireAfterSeconds`, `background`, `partialFilterExpression`, `collation`.

## Explain query

Press `x` to toggle the explain preview pane. It shows the execution plan for the current query or pipeline as stage cards connected by arrows — each card shows the stage type, returned count, and execution time.

- `COLLSCAN` stages are highlighted in red and show which fields have no index
- `IXSCAN` stages are highlighted in green and show the index name and key pattern
- The summary section shows total docs returned/examined, execution time, ratio, and index info
- Auto-refreshes when you reload (`r`) or change the query

Press `Shift+X` to open the full raw explain JSON in `$EDITOR` for deep inspection.

Both actions are also available from the command palette (`Ctrl+P` → "Explain Query").

## Bulk update / delete via query

Open via `Ctrl+P` → **Bulk Update (query)** or **Bulk Delete (query)**.

### Bulk Update

Opens a JSONC template in `$EDITOR` pre-populated with the active filter:

```jsonc
{
  "filter": { /* pre-populated from your active query */ },
  "update": { "$set": {} },
  "upsert": false
}
```

Edit the `update` expression using any MongoDB update operator (`$set`, `$unset`, `$inc`, `$push`, etc.). If your editor has a JSON Language Server, field names and operators autocomplete from the live collection schema. After saving, monq counts matching documents and shows a confirm dialog before writing anything.

Positional array updates are supported — use `"array.$.field"` in `$set` to update the element matched by `$elemMatch` in the filter.

Set `"upsert": true` to insert a new document if no documents match. Use `$setOnInsert` to set fields only on insert.

### Bulk Delete

Opens a JSONC template with just a filter:

```jsonc
{
  "filter": { /* pre-populated from your active query */ }
}
```

After saving, monq shows how many documents match and asks for confirmation before deleting.

## Themes

Switch between the 11 built-in colour themes at any time via the command palette (`Ctrl+P` → search "theme"). The selected theme is persisted across sessions.

You can also set a default theme or customise individual colours in `~/.config/monq/config.toml`. See [Configuration](/monq/reference/configuration/) for details.
