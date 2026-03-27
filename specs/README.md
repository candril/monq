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
2. Review and refine -> `Ready`
3. Begin implementation -> `In Progress`
4. Complete and verified -> move to `done/` folder

## Current Specs

| # | Name | Status | Description |
|---|------|--------|-------------|
| 000 | [Vision](./000-vision.md) | Ready | Overall product vision and goals |
| 001 | [App Shell](./001-app-shell.md) | Done | Basic application shell with OpenTUI React |
| 002 | [Collection Browser](./002-collection-browser.md) | Done | Ctrl+P collection picker with fuzzy search |
| 003 | [Document List](./003-document-list.md) | Done | Document table with auto-detected columns, h/l column selection |
| 004 | [Query Bar](./004-query-bar.md) | Ready | Simple and BSON query modes |
| 005 | [Document Preview](./005-document-preview.md) | Done | Syntax-highlighted JSON preview via OpenTUI `<code>` |
| 006 | [Collection Tabs](./006-collection-tabs.md) | In Progress | Tabs exist in state, UI not built yet |
| 007 | [Document Editing](./007-document-editing.md) | Done | Edit in $EDITOR with suspend/resume |
| 008 | [Command Palette](./008-command-palette.md) | Done | Ctrl+P palette with fuzzy search, collection switching |

## Next Up

1. **004 - Query Bar** — `/` to open, simple `Key:Value` + BSON mode filtering
2. **006 - Collection Tabs** — Tab bar UI, switching between open collections
3. **Filter from value** — press `f` on a cell to filter by that field=value
4. **More palette commands** — document operations, view operations
