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
| 001 | [App Shell](./001-app-shell.md) | Ready | Basic application shell with OpenTUI React |
| 002 | [Collection Browser](./002-collection-browser.md) | Ready | Browse databases and collections |
| 003 | [Document List](./003-document-list.md) | Ready | Display documents with auto-detected columns |
| 004 | [Query Bar](./004-query-bar.md) | Ready | Simple and BSON query modes |
| 005 | [Document Preview](./005-document-preview.md) | Ready | JSON tree view with drill-down |
| 006 | [Collection Tabs](./006-collection-tabs.md) | Ready | Open collections in tabs |
| 007 | [Document Editing](./007-document-editing.md) | Draft | Edit and update documents |
| 008 | [Command Palette](./008-command-palette.md) | Ready | Ctrl+P palette for all operations |

## MVP Path

The recommended implementation order for MVP:

1. **001 - App Shell** (P1) - Get the basic app running with --uri connection
2. **002 - Collection Browser** (P1) - Browse databases and collections
3. **003 - Document List** (P1) - Display documents with smart columns
4. **004 - Query Bar** (P1) - Simple key:value and BSON query modes
5. **005 - Document Preview** (P2) - JSON tree view with drill-down
6. **006 - Collection Tabs** (P2) - Open multiple collections in tabs
7. **007 - Document Editing** (P2) - Edit documents inline or in $EDITOR
8. **008 - Command Palette** (P1) - Ctrl+P for switching collections, databases, operations
