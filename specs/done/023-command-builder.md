# State-Aware Command Builder

**Status**: Done

## Description

A centralised function that builds the full set of command palette commands based on the current application state. Commands are conditionally included depending on whether a tab is open, whether a document is selected, and what query/pipeline modes are active. This keeps `App.tsx` free of command-set logic and makes the palette context-sensitive.

## Out of Scope

- Plugin or user-defined commands
- Commands with sub-menus

## Capabilities

### P1 - Must Have (all done)

- `buildCommands(state)` returns the full `Command[]` for the main palette — **done**
  - Always present: `nav:switch-collection`, `nav:switch-database`
  - When a tab is open: `query:open-filter`, `query:open-pipeline`, `view:toggle-preview`, `view:cycle-preview`, `view:toggle-filter-bar`, `view:reload`, `query:sort`
  - Conditionally present:
    - `query:clear-pipeline` — only when pipeline is active
    - `query:clear-filter` — only when a simple/BSON filter is active
    - `query:format-bson` — only in BSON mode
  - When a document is selected: `doc:edit`, `doc:copy-json`, `doc:copy-id`, `doc:filter-value`
- Commands carry `shortcut` strings for display in the palette — **done**

### P2 - Should Have

- Category grouping via `CATEGORY_ORDER` in `commands/types.ts` — **done**
  - Order: `navigation` → `document` → `view` → `query` → `database` → `collection`

## Key Files

- `src/commands/builder.ts` — `buildCommands(state, hasTab, hasDoc): Command[]`
- `src/commands/types.ts` — `Command` interface; `CATEGORY_ORDER`
- `src/commands/collections.ts` — `buildCollectionCommands(collections): Command[]`
- `src/commands/databases.ts` — `buildDatabaseCommands(databases): Command[]`
- `src/App.tsx` — calls `buildCommands` via `useMemo`; passes result to `<CommandPalette>`
