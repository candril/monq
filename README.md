# monq

Browse, query, edit. MongoDB without leaving the terminal.

```
monq --uri mongodb://localhost:27017/mydb
```

---

### Browse collections with smart columns

Auto-detects document fields, sorts, hides columns, and scrolls horizontally. Press `/` to open the query bar — filter with `price<20`, `customer:Alice`, regex, arrays and more. Switch to raw BSON JSON or a full aggregation pipeline with `Tab`.

<img src="site/src/assets/screenshots/document-list.png" alt="Document list with smart columns and inline query bar" width="100%" />

### A filter bar that speaks your language

No query language to learn. Combine conditions freely — `product:Mouse price:10..200 qty>30` filters by exact value, range, and comparison in one line. Field names autocomplete from the live schema as you type.

<img src="site/src/assets/screenshots/filter-combined.png" alt="Filter bar with combined query: product:Mouse price:10..200 qty>30" width="100%" />

<img src="site/src/assets/screenshots/filter-nested.png" alt="Filter bar with nested field query items.color:Black" width="100%" />

Open the filter bar with `/` and the schema dropdown appears — every field with its type, ready to autocomplete.

<img src="site/src/assets/screenshots/query-bar.png" alt="Filter bar open showing schema-aware field suggestions" width="100%" />

### Write aggregation pipelines with live feedback

Press `Ctrl+F` to open the pipeline editor in `$EDITOR` with JSON Schema autocompletion. Results update instantly on save. Press `Ctrl+E` to open a tmux split alongside monq and iterate without leaving the terminal.

<img src="site/src/assets/screenshots/pipeline-editor.png" alt="Pipeline editor open in a tmux split alongside live results" width="100%" />

### Everything at your fingertips via the command palette

`Ctrl+P` opens the palette — switch collections, change themes, open the pipeline editor, navigate databases, and more, all searchable from one place.

<img src="site/src/assets/screenshots/command-palette.png" alt="Command palette with searchable actions and keybinding hints" width="100%" />

### Saved connections with secret resolution

Define named profiles in `~/.config/monq/config.toml`. Use `uri_cmd` to fetch URIs from Vault, 1Password, or any secret manager — secrets never touch the config file.

<img src="site/src/assets/screenshots/connections.png" alt="Saved connection profiles screen on startup" width="100%" />

---

## Features

- **Expressive filter bar** — `field:value`, ranges (`price:10..200`), dates (`createdAt>ago(7d)`), regex, arrays, nested fields, relative expressions
- **Two query modes** — simple filter bar or raw BSON JSON, switch with `Tab`
- **Inline projection** — `+field` / `-field` directly in the query bar, no separate step
- **Pipeline editor** — full aggregation pipelines in `$EDITOR` with JSON Schema autocompletion and live reload
- **Document editing** — edit single docs or bulk-select and edit in `$EDITOR` as a JSON array
- **Bulk update / delete via query** — run `updateMany` or `deleteMany` with a filter you write in `$EDITOR`; shows matched count before applying
- **Index management** — edit all indexes in `$EDITOR` as a live JSON array; add, remove, or edit entries to create, drop, or replace indexes
- **Collection tabs** — open multiple collections side by side, switch with `1–9` or `[`/`]`
- **Schema-aware suggestions** — field name autocomplete with dot-notation drill-down
- **Smart columns** — auto-detects fields, horizontal scroll, sort, column sizing, hide via `-`
- **Saved connections** — named profiles with `uri_cmd` for secret-fetching (Vault, 1Password, etc.)
- **Theme presets** — 11 built-in themes (Tokyo Night, Catppuccin, Gruvbox, Nord, Dracula, and more), switch live via `Ctrl+P`
- **Remappable keybindings** — customise any action in `~/.config/monq/config.toml`

## Install

> **Note:** monq is not yet available via any package manager. You need to build from source.

Requires [Bun](https://bun.sh).

```sh
git clone https://github.com/candril/monq
cd monq
bun install
just build        # produces dist/monq binary
```

Then put `dist/monq` on your `$PATH`, or run directly without building:

```sh
bun src/index.tsx --uri mongodb://localhost:27017/mydb
```

## Usage

```
monq --uri <mongodb-uri>
```

Examples:

```sh
monq --uri mongodb://localhost:27017/mydb
monq --uri "mongodb+srv://user:pass@cluster.mongodb.net/mydb"
monq --uri mongodb://localhost:27017        # picks database interactively
monq                                        # shows saved connections or URI prompt
```

## Key Bindings

### Navigation

| Key | Action |
|-----|--------|
| `j` / `k` | Move down / up |
| `h` / `l` | Move column left / right |
| `Ctrl+D` / `Ctrl+U` | Scroll half page |
| `1`–`9`, `[`, `]` | Switch tabs |
| `t` | Clone current tab |
| `d` | Close tab |
| `u` | Undo close tab |
| `Ctrl+P` | Command palette |
| `q` | Quit |

### Database & Collection Management

| Key/Command | Action |
|-------------|--------|
| `Tab` (welcome screen) | Create new database / collection via inline form |
| `Ctrl+D` (welcome screen) | Drop selected database / collection (requires typing name to confirm) |
| `Ctrl+R` (welcome screen, step 2) | Rename selected collection |
| `Ctrl+P` → **Create Collection** | Create a new collection in the current database |
| `Ctrl+P` → **Rename Collection** | Rename the collection in the current tab |
| `Ctrl+P` → **Drop Current Database** | Drop the active database (requires typing exact name) |
| `Ctrl+P` → **Drop Collection: [name]** | Drop the collection in current tab (requires typing exact name) |

### Querying

| Key | Action |
|-----|--------|
| `/` | Open query bar (simple mode) |
| `Tab` | Toggle simple ↔ BSON mode / switch to pipeline mode |
| `f` | Filter by value under cursor |
| `s` | Cycle sort on current column |
| `-` | Hide current column (adds `-field` projection token) |
| `w` | Cycle column width mode |
| `Ctrl+F` | Open pipeline editor in `$EDITOR` |
| `Ctrl+E` | Open pipeline file in tmux split (or copy path) |
| `Backspace` | Clear query / pipeline |

### Documents

| Key | Action |
|-----|--------|
| `p` / `P` | Toggle / cycle preview pane |
| `e` | Edit document in `$EDITOR` |
| `i` | Insert new document |
| `Shift+I` | Manage indexes (edit all in `$EDITOR`) |
| `v` | Enter / freeze selection mode |
| `Space` | Toggle row selection |
| `Ctrl+A` | Select all |
| `Shift+D` | Delete selected (with confirmation) |
| `y` / `Y` | Copy cell value / full document JSON |
| `r` | Reload |

### Simple Query Syntax

Filter and projection live in the same query string — no separator needed.

```
Author:Peter                     → { "Author": "Peter" }
Author:Peter State:Closed        → { "Author": "Peter", "State": "Closed" }
age>25                           → { "age": { "$gt": 25 } }
age>=18 age<65                   → { "age": { "$gte": 18, "$lt": 65 } }
age:18..65                       → { "age": { "$gte": 18, "$lte": 65 } }
age:..65                         → { "age": { "$lte": 65 } }
name:/^john/i                    → { "name": { "$regex": "^john", "$options": "i" } }
-status:deleted                  → { "status": { "$ne": "deleted" } }
email:null                       → { "email": null }
email:exists                     → { "email": { "$exists": true } }
tags:[admin,user]                → { "tags": { "$in": ["admin", "user"] } }
-tags:[spam,bot]                 → { "tags": { "$nin": ["spam", "bot"] } }
comments:size:0                  → { "comments": { "$size": 0 } }
address.city:London              → { "address.city": "London" }
createdAt>2025-01-01             → { "createdAt": { "$gt": ISODate("2025-01-01T00:00:00Z") } }
createdAt:2025-01-01..2025-12-31 → date range ($gte start-of-day, $lte end-of-day)
createdAt>ago(7d)                → last 7 days
createdAt:ago(1m)..today         → last month up to start of today
expiresAt<in(7d)                 → expires within 7 days
```

Date expressions: `YYYY-MM-DD`, `YYYY-MM-DDTHH:MM:SSZ`, `now`, `today`, `ago(Nd/Nw/Nm/Nh)`, `in(Nd/Nw/Nm/Nh)`.

**Projection tokens** (inline, no separator):

```
Author:Peter +name +email       → filter by Author, return only name and email
Author:Peter -_id -tags         → filter by Author, exclude _id and tags
+name +score -_id               → projection only, no filter
```

`+field` = include, bare `-field` = exclude. `-field:value` is still a `$ne` filter.

## Configuration

Create `~/.config/monq/config.toml` to customise themes and keybindings:

```toml
# Pick a built-in theme preset
theme_preset = "catppuccin-mocha"

[theme]
# Override individual colour tokens (hex)
primary = "#ff9e64"

[keys]
# Remap actions to different keys
"nav.down" = ["j", "down"]
"app.quit" = "q"
```

Available theme presets: `tokyo-night` (default), `catppuccin-mocha`, `catppuccin-latte`, `gruvbox-dark`, `nord`, `dracula`, `solarized-dark`, `one-dark-pro`, `rose-pine`, `rose-pine-moon`, `rose-pine-dawn`.

You can also switch themes interactively at any time from the command palette (`Ctrl+P`).

## Saved Connections

Add named connection profiles to `~/.config/monq/config.toml`:

```toml
[connections.local]
name = "Local Dev"
uri  = "mongodb://localhost:27017"

[connections.prod]
name    = "Production"
uri_cmd = ["vault", "read", "-field=uri", "secret/mongo/prod"]
```

`uri_cmd` runs a command and uses its stdout as the URI — secrets never touch the config file.

## Tech Stack

- **Runtime**: [Bun](https://bun.sh)
- **UI**: [OpenTUI](https://github.com/anomalyco/opentui) (React reconciler for the terminal)
- **Database**: [MongoDB Node.js Driver](https://github.com/mongodb/node-mongodb-native)
- **Language**: TypeScript

## Development

```sh
just dev --uri mongodb://localhost:27017/mydb   # hot reload
just typecheck                                   # type check
just test                                        # run tests
```

Specs for all features live in [`specs/`](./specs/).

## License

MIT
