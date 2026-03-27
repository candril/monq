# Collection Browser

**Status**: Ready

## Description

Browse databases and collections in the connected MongoDB instance. This is the initial view when launching Mon-Q - a list of collections in the current database that can be selected to open in a tab.

## Out of Scope

- Document display (spec 003)
- Creating/dropping collections (admin operations)
- Cross-database browsing (use --uri to specify database)

## Capabilities

### P1 - Must Have

- List all collections in the current database
- Show collection name, document count, and storage size
- Navigate with j/k (vim-style)
- Press Enter to open collection in a new tab (spec 006)
- Show estimated document count for each collection

### P2 - Should Have

- Sort collections by name, doc count, or size
- Show index count per collection
- Filter/search collections by name with `/`

### P3 - Nice to Have

- Show collection type (collection vs view vs timeseries)
- Show sample document for preview

## Technical Notes

### Fetching Collections

```typescript
const collections = await db.listCollections().toArray()

// Get stats for each collection
for (const col of collections) {
  const stats = await db.collection(col.name).estimatedDocumentCount()
}
```

### Layout

```
┌─────────────────────────────────────────────┐
│ Mon-Q  mydb@localhost           3 collections│
├─────────────────────────────────────────────┤
│   Collection          Docs        Size      │
│ > users               1,234       2.1 MB    │
│   orders              45,678      128 MB    │
│   products            892         512 KB    │
│   sessions            12,345      4.2 MB    │
│   audit_log           234,567     1.2 GB    │
│                                             │
└─────────────────────────────────────────────┘
```

## File Structure

### Create
- `src/components/CollectionList.tsx` - Collection browser component

### Modify
- `src/App.tsx` - Add collection browser view
- `src/state.ts` - Add collection list state
- `src/types.ts` - Add collection types
