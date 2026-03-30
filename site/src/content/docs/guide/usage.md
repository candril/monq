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
- `Shift+D` — delete selected documents (with confirmation)

## Themes

Switch between the 11 built-in colour themes at any time via the command palette (`Ctrl+P` → search "theme"). The selected theme is persisted across sessions.

You can also set a default theme or customise individual colours in `~/.config/monq/config.toml`. See [Configuration](/monq/reference/configuration/) for details.
