# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-04-23

### Added
- **Collection sidebar** (spec 053) — vertical collapsible nav pane listing collections in the current database.
- **Ephemeral peek tabs** (spec 054) — `{` / `}` peek adjacent collections into a reusable ephemeral tab instead of opening a permanent one.
- **Sidebar-first landing** (spec 055) — connecting to a DB lands focus in the sidebar so you can browse before picking a collection. Single-collection DBs still land straight in the doc view.
- `h` / `l` cross-pane navigation between the sidebar and the document list.

### Fixed
- Sidebar `j`/`k` anchors to the cursor, not the active tab.
- `q` quits from the sidebar / no-tab states; `activeTabId` gates relaxed.
- Column order follows the first document's field order instead of alphabetical.
- In-flight document fetch is cancelled when a peek reassigns the ephemeral tab.
- Removed deprecated `downlevelIteration` tsconfig option.
- Collection sidebar polish — taller sidebar, colour-only state indicators, truncated long names.

## [0.3.0] - 2026-04-08

### Added
- **Document marks** — vim-style letter marks (`m<letter>`) on individual documents, scoped per `(host, db, collection)` and persisted to `~/.local/share/monq/marks`. Marked rows show a colored letter in the leftmost gutter.
- `'<letter>` applies a mark filter to the active query mode: toggles `@<letter>` in simple mode, sets `_id: { $in }` in BSON / pipeline. `''` clears it.
- `@<letter>` mark register token in the simple query bar — composes with other filter tokens (e.g. `@a Author:Peter`). Resolves at parse time so the simple-mode filter is live.
- Suggestion panel surfaces every used `@<letter>` register when you type `@`, with doc count and color.
- Command palette: "Clear All Marks (current collection)" and per-letter "Clear Mark [a] (3 docs)" entries (only shown when marks exist).
- Selection-mode marking: in selection mode, `m<letter>` marks all selected rows at once.
- **Value suggestions** in the simple query bar — sampled values from loaded documents and quick-filter helpers. After typing `field:`, the panel suggests real values from the current result set plus type-aware helpers (`>ago(7d)`, `:today`, `oid(...)`, `null`).
- **Operator suggestions** for typed fields — typing a known field name surfaces `:`, `!=`, `>`, `>=`, `<`, `<=`, and the `:..` range stub for date and number fields.
- `field:in(a,b,c)` shorthand for `$in` queries, parseable in the simple query bar.
- **Per-collection query history** — each `(database, collection)` pair has its own `Ctrl+R` history list, instead of sharing across all collections in a database.

### Fixed
- BSON-mode queries with ObjectId values now match correctly. `parseBsonQuery` was using plain `JSON.parse`, which decoded `{"$oid":"..."}` as a plain object the driver couldn't match against. Switched to `EJSON.parse` (with `JSON.parse` fallback for backward compat).

## [0.2.0] - 2026-04-02

### Added
- Export query results as JSON or CSV
- Eager explain refresh on query change
- Animated loading spinner across all columns
- `--version` flag; version shown on connection screens (git hash in dev mode)

### Fixed
- Pipeline state is saved/restored per tab; watcher restarts on tab switch
- Preview panel now shows relaxed EJSON format matching the editor
- Command palette "Edit Document" uses the same code path as the `e` key
- Checksum verification uses `shasum` unconditionally on macOS
- Release workflow uses native runners for each build target

## [0.1.0] - 2026-04-01

### Added
- Terminal-based MongoDB browser and query tool with a keyboard-first interface.
