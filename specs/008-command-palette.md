# Command Palette

**Status**: Ready

## Description

A Ctrl+P command palette for quick access to all operations: switch collections, switch databases, document operations, and general commands. Follows the same pattern as PResto's command palette.

## Out of Scope

- Custom user-defined commands
- Scripting/macros

## Capabilities

### P1 - Must Have

- Open with `Ctrl+p`
- Fuzzy search across all available commands
- **Switch collection**: Type collection name to jump to it (opens in new tab)
- **Switch database**: Type `db:` prefix to switch databases
- Close with `Escape`
- Execute selected command with `Enter`
- Navigate with `j/k` or arrow keys

### P2 - Should Have

- **Document operations** (when in document view):
  - `Edit document` - Open in $EDITOR
  - `Copy document as JSON` - Copy to clipboard
  - `Copy _id` - Copy document ID
  - `Delete document` - With confirmation
  - `Duplicate document` - Insert copy with new _id
- **Collection operations**:
  - `Count documents` - Show total count
  - `Collection stats` - Show size, indexes, etc.
  - `Drop collection` - With double confirmation
- **View operations**:
  - `Toggle preview` - Show/hide preview panel
  - `Toggle columns` - Show/hide specific columns
  - `Sort by...` - Choose sort field
- Recently used commands at top

### P3 - Nice to Have

- **Query operations**:
  - `Save query` - Save current filter for later
  - `Load query` - Load a saved query
  - `Export results` - Export as JSON/CSV
- **Index operations**:
  - `Show indexes` - List indexes for current collection
  - `Explain query` - Show query execution plan
- Command categories with section headers
- Keyboard shortcut hints next to commands

## Technical Notes

### Command Registry

```typescript
interface Command {
  id: string
  label: string
  /** Category for grouping in palette */
  category: "collection" | "database" | "document" | "view" | "query"
  /** Keyboard shortcut hint (display only) */
  shortcut?: string
  /** Whether this command is available in current context */
  available: (context: CommandContext) => boolean
  /** Execute the command */
  execute: (context: CommandContext) => Promise<CommandResult>
}

interface CommandContext {
  /** Current database */
  db: Db
  /** Current collection name (if in document view) */
  collection?: string
  /** Currently selected document (if any) */
  selectedDocument?: Document
  /** App state dispatch */
  dispatch: Dispatch<AppAction>
}

type CommandResult =
  | { type: "success"; message?: string }
  | { type: "error"; message: string }
  | { type: "refresh" }  // Re-fetch current data
```

### Dynamic Commands

The palette generates commands dynamically:
- All collection names become "Open {collection}" commands
- All database names become "Switch to {database}" commands
- Document operations only appear when a document is selected

### Layout

```
┌─────────────────────────────────────────────┐
│ > switch to us_                             │  <- Fuzzy search input
├─────────────────────────────────────────────┤
│   Collections                               │
│ > Open users                         Enter  │
│   Open user_sessions                 Enter  │
│                                             │
│   Databases                                 │
│   Switch to users_staging            Enter  │
│                                             │
│   Document                                  │
│   Edit document                        e    │
│   Copy as JSON                         y    │
│   Delete document                      D    │
└─────────────────────────────────────────────┘
```

### Fuzzy Matching

```typescript
function fuzzyMatch(query: string, text: string): { match: boolean; score: number } {
  const lower = text.toLowerCase()
  const queryLower = query.toLowerCase()
  
  let queryIndex = 0
  let score = 0
  let lastMatchIndex = -1
  
  for (let i = 0; i < lower.length && queryIndex < queryLower.length; i++) {
    if (lower[i] === queryLower[queryIndex]) {
      score += (i === lastMatchIndex + 1) ? 2 : 1  // Bonus for consecutive
      lastMatchIndex = i
      queryIndex++
    }
  }
  
  return { match: queryIndex === queryLower.length, score }
}
```

## File Structure

### Create
- `src/commands/index.ts` - Command registry
- `src/commands/collection.ts` - Collection commands
- `src/commands/database.ts` - Database commands
- `src/commands/document.ts` - Document commands
- `src/commands/view.ts` - View commands
- `src/components/CommandPalette.tsx` - Command palette UI

### Modify
- `src/App.tsx` - Integrate command palette
- `src/state.ts` - Add command palette visibility state
