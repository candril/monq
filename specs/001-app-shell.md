# App Shell

**Status**: Ready

## Description

Basic application shell with OpenTUI React. Connects to MongoDB via `--uri` flag, shows a header with connection info, and provides the foundational layout for all views. No status bar — discoverability comes from `Ctrl+P` command palette.

## Out of Scope

- Collection browsing (spec 002)
- Document display (spec 003)
- Query input (spec 004)

## Capabilities

### P1 - Must Have

- Parse `--uri` flag from command line arguments
- Connect to MongoDB using the official driver
- Display app header with database name and connection status
- Display filter bar at the bottom showing active query (when filtering)
- Handle `q` to quit (renderer.destroy() + client.close())
- Show error state if connection fails
- Show loading state while connecting

### P2 - Should Have

- Display database stats (collection count, data size) in header
- Show connection latency indicator

### P3 - Nice to Have

- Reconnect on connection drop

## Technical Notes

### CLI Arguments

```
monq --uri mongodb://localhost:27017/mydb
monq --uri "mongodb+srv://user:pass@cluster.mongodb.net/mydb"
```

Parse with `Bun.argv` or `process.argv`:
```typescript
const args = process.argv.slice(2)
const uriIndex = args.indexOf("--uri")
const uri = uriIndex !== -1 ? args[uriIndex + 1] : null
```

### MongoDB Connection

```typescript
import { MongoClient } from "mongodb"

const client = new MongoClient(uri)
await client.connect()
const db = client.db() // Uses database from URI
```

### Layout

```
┌─────────────────────────────────────────────┐
│ Mon-Q  mydb@localhost           3 collections│  <- Header (1 line)
├─────────────────────────────────────────────┤
│                                             │
│            (content area)                   │  <- Main area (flex grow)
│                                             │
├─────────────────────────────────────────────┤
│ / name:/^john/i age>25                      │  <- FilterBar (1 line, only when query active)
└─────────────────────────────────────────────┘
```

No status bar with keyboard hints — `Ctrl+P` command palette is the sole discoverability mechanism.

## File Structure

### Create
- `src/index.tsx` - Entry point, parse --uri, connect, render
- `src/App.tsx` - Main app component
- `src/state.ts` - App state with useReducer
- `src/types.ts` - Type definitions
- `src/theme.ts` - Tokyo Night color palette
- `src/components/Shell.tsx` - Root layout wrapper
- `src/components/Header.tsx` - Title bar
- `src/components/FilterBar.tsx` - Bottom filter bar (shows active query)
- `src/components/Loading.tsx` - Loading spinner
- `src/providers/mongodb.ts` - MongoDB connection wrapper
