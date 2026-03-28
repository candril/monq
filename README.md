# mon-q

A terminal-based MongoDB browser and query tool. Keyboard-first, zero config — pass `--uri` and explore.

```
monq --uri mongodb://localhost:27017/mydb
```

## Features

- **Two query modes** — simple human-readable `Key:Value` syntax or raw BSON JSON
- **Inline projection** — `+field` to include, `-field` to exclude columns directly in the query bar
- **Pipeline editor** — write full aggregation pipelines in `$EDITOR` with JSON Schema autocompletion
- **Live pipeline reload** — watch `pipeline.jsonc` for external changes; open a tmux split with `Ctrl+E`
- **Collection tabs** — open multiple collections side by side, switch with `1-9` or `[`/`]`
- **Document editing** — edit single docs or bulk-select and edit in `$EDITOR` as a JSON array
- **Schema-aware suggestions** — field name autocomplete with dot-notation drill-down, projection-aware
- **Smart columns** — auto-detects document fields, horizontal scroll, sort, column sizing, hide via `-`
- **Database switcher** — picks database on startup if none in URI; switch anytime via `Ctrl+P`

## Install

Requires [Bun](https://bun.sh).

```sh
git clone https://github.com/candril/monq
cd monq
bun install
just build        # produces dist/monq binary
```

Then put `dist/monq` on your `$PATH`, or run directly:

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
| `v` | Enter / freeze selection mode |
| `Space` | Toggle row selection |
| `Ctrl+A` | Select all |
| `Shift+D` | Delete selected (with confirmation) |
| `y` / `Y` | Copy cell value / full document JSON |
| `r` | Reload |

### Simple Query Syntax

Filter and projection live in the same query string — no separator needed.

```
Author:Peter                    → { "Author": "Peter" }
Author:Peter State:Closed       → { "Author": "Peter", "State": "Closed" }
age>25                          → { "age": { "$gt": 25 } }
age>=18 age<65                  → { "age": { "$gte": 18, "$lt": 65 } }
name:/^john/i                   → { "name": { "$regex": "^john", "$options": "i" } }
-status:deleted                 → { "status": { "$ne": "deleted" } }
email:null                      → { "email": null }
email:exists                    → { "email": { "$exists": true } }
tags:[admin,user]               → { "tags": { "$in": ["admin", "user"] } }
-tags:[spam,bot]                → { "tags": { "$nin": ["spam", "bot"] } }
comments:size:0                 → { "comments": { "$size": 0 } }
address.city:London             → { "address.city": "London" }
```

**Projection tokens** (inline, no separator):

```
Author:Peter +name +email       → filter by Author, return only name and email
Author:Peter -_id -tags         → filter by Author, exclude _id and tags
+name +score -_id               → projection only, no filter
```

`+field` = include, bare `-field` = exclude. `-field:value` is still a `$ne` filter.

Projection tokens carry through to the pipeline editor and BSON mode automatically.

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
