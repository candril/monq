# Specs

This directory contains feature specifications for Mon-Q.

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
| 004 | [Query Bar](./004-query-bar.md) | In Progress | Simple and BSON query modes — P1 done, P2 partially done |
| 009 | [Export](./009-export.md) | Draft | Export results as JSON/CSV |
| 019 | [Pluggable Backends](./019-pluggable-backends.md) | Draft | CSV/NDJSON/SQLite data source abstraction |

## Done Specs

| # | Name | Description |
|---|------|-------------|
| 001 | [App Shell](./done/001-app-shell.md) | OpenTUI renderer, `--uri` arg, braille spinner, quit |
| 002 | [Collection Browser](./done/002-collection-browser.md) | Ctrl+P collection picker with fuzzy search |
| 003 | [Document List](./done/003-document-list.md) | Document table with auto-detected columns, h/l column selection |
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
