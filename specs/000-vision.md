# Mon-Q Vision

**Status**: Ready

## What is Mon-Q?

Mon-Q (monk) is a terminal-based MongoDB browser and query tool. It brings the same keyboard-first, beautiful TUI experience as PResto to the world of MongoDB data exploration.

## Core Philosophy

1. **Keyboard-first** - Everything accessible via keyboard shortcuts (vim-style j/k navigation)
2. **Query-centric** - Two query modes: simple human-readable (`Author:Peter`) and full BSON
3. **Browse, don't configure** - No config files. Pass `--uri` and go. New instance per connection
4. **Tabs for collections** - Each collection opens in its own tab, like browser tabs
5. **Drill into data** - Navigate nested JSON/subdocuments naturally
6. **Smart columns** - Auto-detect document fields and show as columns

## Design Principles

- **Zero config** - `monq --uri mongodb://localhost:27017/mydb` and you're in
- **Read-first** - Browsing and querying is the primary use case
- **Safe mutations** - Editing requires confirmation, destructive ops need extra confirmation
- **Fast feedback** - Queries execute as you type (with debounce)
- **Discoverable** - Status bar hints, `?` for help, command palette

## Query UX

### Simple Mode (default)
Type human-readable filters that map to MongoDB queries:
```
Author:Peter State:Closed          -> { "Author": "Peter", "State": "Closed" }
age>25                             -> { "age": { "$gt": 25 } }
name:/^john/i                      -> { "name": { "$regex": "^john", "$options": "i" } }
```

### BSON Mode (toggle with Tab)
Type raw MongoDB filter JSON:
```json
{ "age": { "$gt": 25 }, "tags": { "$in": ["admin", "user"] } }
```

### Filter on Current Values
Select a field value in a document and press `/` to filter all documents by that value.
Like "show me all documents where status equals this".

## Non-Goals

- Connection management / saved connections (just use --uri)
- MongoDB admin operations (createIndex, dropCollection, etc.)
- Aggregation pipeline builder (maybe later)
- Schema visualization
- Replication/sharding management

## Target Users

Developers who:
- Work with MongoDB daily
- Prefer terminal over GUI tools
- Want quick data exploration without leaving the terminal
- Currently use `mongosh` but want a more visual experience
