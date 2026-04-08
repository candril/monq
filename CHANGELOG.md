# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Document marks** — vim-style letter marks (`m<letter>`) on individual documents, scoped per `(host, db, collection)` and persisted to `~/.local/share/monq/marks`. Marked rows show a colored letter in the leftmost gutter.
- `'<letter>` applies a mark filter to the active query mode: toggles `@<letter>` in simple mode, sets `_id: { $in }` in BSON / pipeline. `''` clears it.
- `@<letter>` mark register token in the simple query bar — composes with other filter tokens (e.g. `@a Author:Peter`). Resolves at parse time so the simple-mode filter is live.
- Suggestion panel surfaces every used `@<letter>` register when you type `@`, with doc count and color.
- Command palette: "Clear All Marks (current collection)" and per-letter "Clear Mark [a] (3 docs)" entries (only shown when marks exist).
- Selection-mode marking: in selection mode, `m<letter>` marks all selected rows at once.
- Per-collection query history — each `(database, collection)` pair has its own `Ctrl+R` history list, instead of sharing across all collections in a database.

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
