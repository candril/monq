# Specs

This directory contains feature specifications for Monq.

## Format

Each spec follows a consistent structure:

- **Status**: `Draft` | `Ready` | `In Progress` | `Done`
- **Description**: What this feature does
- **Out of Scope**: What this feature explicitly does NOT do
- **Capabilities**: Prioritized list (P1 = MVP, P2 = Important, P3 = Nice to have)
- **Technical Notes**: Implementation details, code examples, file structure

## Naming

Specs are numbered sequentially: `NNN-feature-name.md`

## Workflow

1. Create spec as `Draft`
2. Review and refine → `Ready`
3. Begin implementation → `In Progress`
4. Complete and verified → move to `done/` folder

## Active Specs

| # | Name | Status | Description |
|---|------|--------|-------------|
| 000 | [Vision](./000-vision.md) | Ready | Product vision and core philosophy |
| 009 | [Export](./009-export.md) | Draft | Export results as JSON/CSV |
| 028 | [Connection Error Handling](./028-connection-error-handling.md) | Draft | Graceful handling of connection failures and timeouts |

## Done Specs

| # | Name | Description |
|---|------|-------------|
| 001 | [App Shell](./done/001-app-shell.md) | OpenTUI renderer, `--uri` arg, braille spinner, quit |
| 002 | [Collection Browser](./done/002-collection-browser.md) | Ctrl+P collection picker with fuzzy search |
| 003 | [Document List](./done/003-document-list.md) | Document table with auto-detected columns, h/l column selection |
| 004 | [Query Bar](./done/004-query-bar.md) | Simple and BSON query modes |
| 005 | [Document Preview](./done/005-document-preview.md) | Syntax-highlighted JSON preview via `<code>` |
| 006 | [Collection Tabs](./done/006-collection-tabs.md) | Tab bar, `1-9`/`[`/`]` switching, clone, undo close |
| 007 | [Document Editing](./done/007-document-editing.md) | Edit in `$EDITOR`, bulk edit, insert |
| 008 | [Command Palette](./done/008-command-palette.md) | Ctrl+P palette with fuzzy search, state-aware commands |
| 010 | [Paging](./done/010-paging.md) | 50-doc pages, load-more on scroll, count display |
| 011 | [Selection and Deletion](./done/011-selection-and-deletion.md) | Visual selection mode, bulk delete with confirm |
| 012 | [Pipeline Query Editor](./done/012-pipeline-query-editor.md) | Ctrl+F pipeline editor, JSONC, schema sidecar |
| 013 | [Bulk Edit and Insert](./done/013-bulk-edit-and-insert.md) | Multi-doc edit in `$EDITOR`, insert with template |
| 014 | [Clipboard Yank](./done/014-clipboard-yank.md) | `y` cell value, `Y` full document JSON via OSC 52 |
| 015 | [Field Suggestions](./done/015-field-suggestions.md) | Schema-aware field name autocomplete in query bar |
| 016 | [Filter from Value](./done/016-filter-from-value.md) | `f` on cell appends `field:value` to query |
| 017 | [Tab Utilities](./done/017-tab-utilities.md) | Clone tab, pipeline-to-simple dialog |
| 018 | [Pipeline Live Reload](./done/018-pipeline-live-reload.md) | File watcher on pipeline.jsonc, Ctrl+E tmux split |
| 019 | [Database Switcher](./done/019-database-switcher.md) | DB picker on startup, `Switch Database` palette command |
| 020 | [Toast Notifications](./done/020-toast-notifications.md) | Auto-dismissing status messages (info/success/warning/error) |
| 021 | [Confirm Dialogs](./done/021-confirm-dialogs.md) | Generic modal confirmation for delete, bulk edit, pipeline switch |
| 022 | [Schema Map](./done/022-schema-map.md) | Runtime field-path type map for suggestions and `$elemMatch` |
| 023 | [Command Builder](./done/023-command-builder.md) | State-aware command set for the command palette |
| 024 | [Simple Projection](./done/024-simple-projection.md) | Inline `+field` / `-field` projection tokens in query bar |
| 025 | [Prevent Closing Last Tab](./done/025-prevent-closing-last-tab.md) | Show toast instead of closing the last remaining tab |
| 026 | [Fix Bulk Edit Go-Back](./done/026-fix-bulk-edit-goback-side-effects.md) | Fix side-effect dialog after re-editing deleted docs |
| 027 | [Fix Sort After Pipeline](./done/027-fix-sort-after-pipeline-editor.md) | Fix column sort not working after pipeline editor |
| 029 | [Welcome Screen](./done/029-welcome-screen.md) | Full-screen DB and collection picker on startup |
| 030 | [Backspace to DB Picker](./done/030-backspace-to-db-picker.md) | Backspace returns to DB picker from collection picker |
| 031 | [Deep Schema Extraction](./done/031-deep-schema-extraction.md) | Walk nested objects/arrays for dot-notation field paths |
| 032 | [App.tsx Cleanup](./done/032-app-tsx-cleanup.md) | Extract inline logic into dedicated components/utilities |
| 033 | [Configuration](./done/033-configuration.md) | Optional TOML config for keybindings and colour theme |
| 034 | [Saved Connections](./done/034-saved-connections.md) | Named connection profiles in config.toml |
| 035 | [Empty States and Create](./done/035-empty-states-and-create.md) | Empty state UX, create database/collection |
| 036 | [Date & Range Support](./done/036-date-range-support-in-simple-query.md) | Date-like strings and range operators in simple query bar |
| 037 | [OID Shorthand](./done/037-oid-shorthand.md) | `oid(...)` shorthand for `ObjectId(...)` in query bar |
| 038 | [Fix Filter After Paging](./done/038-fix-filter-after-paging.md) | Fix stale documents after filtering when paged |
| 039 | [Bulk Query Update](./done/039-bulk-query-update.md) | `updateMany` / `deleteMany` from command palette |
| 040 | [Index Management](./done/040-index-management.md) | Browse, create, and drop indexes via `$EDITOR` flow |
| 041 | [Explain Query](./done/041-explain-query.md) | On-demand explain with ASCII execution plan tree |
| 042 | [Dynamic Key Hints](./done/042-command-palette-dynamic-key-hints.md) | Command palette reads key hints from config |
| 043 | [Loading Spinner Animation](./done/043-loading-spinner-animation.md) | Animate all columns of the big braille spinner |
| 044 | [Explain Eager Refresh](./done/044-explain-eager-refresh.md) | Fire explain immediately on query change |
| 045 | [Pluggable Backends](./done/045-pluggable-backends.md) | CSV/NDJSON/SQLite data source abstraction (de-scoped) |
| 046 | [Pipeline $limit Mutation Bug](./done/046-pipeline-limit-mutation-bug.md) | Fix cursor.limit() mutating React pipeline state |
| 047 | [Pipeline Watcher Lifecycle](./done/047-pipeline-watcher-tab-lifecycle.md) | Restart file watcher when switching back to tab |
| 048 | [Date Filter by Value](./done/048-date-filter-by-value.md) | Fix `f` on Date columns producing broken filter tokens |
| 049 | [Explain Limit Guard](./done/049-explain-limit-guard.md) | Auto-inject $limit for explain on large collections |
| 050 | [Fix Column/Preview Overlap](./done/050-fix-column-browser-preview-overlap.md) | Fix column browser overlapping with preview panel |
