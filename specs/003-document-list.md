# Document List

**Status**: Ready

## Description

Display documents from a collection in a tabular format with auto-detected columns. This is the main view when browsing a collection - showing documents as rows with their fields as columns.

## Out of Scope

- Query/filter input (spec 004)
- Full document preview (spec 005)
- Document editing (spec 007)

## Capabilities

### P1 - Must Have

- Display documents as rows in a table
- Auto-detect common fields from first N documents to use as columns
- Show `_id` column always (truncated ObjectId)
- Navigate with j/k between documents
- Paginate / lazy-load documents (fetch 50 at a time, load more on scroll)
- Truncate long values to fit column width
- Show document count and current position in header

### P2 - Should Have

- Toggle column visibility (show/hide specific fields)
- Resize columns based on content
- Sort by column (press `s` then column letter)
- Show nested field values with dot notation (e.g., `address.city`)
- Different colors for different value types (string, number, boolean, null, ObjectId)

### P3 - Nice to Have

- Pin columns (always visible while scrolling horizontally)
- Column reordering
- Detect and show array lengths instead of array contents

## Technical Notes

### Column Detection

```typescript
// Sample first 100 documents to detect common fields
const sample = await collection.find({}).limit(100).toArray()

// Count field frequency
const fieldCounts = new Map<string, number>()
for (const doc of sample) {
  for (const key of Object.keys(doc)) {
    fieldCounts.set(key, (fieldCounts.get(key) ?? 0) + 1)
  }
}

// Use fields that appear in >50% of documents as columns
const threshold = sample.length * 0.5
const columns = [...fieldCounts.entries()]
  .filter(([, count]) => count >= threshold)
  .sort((a, b) => b[1] - a[1])
  .map(([field]) => field)
```

### Value Formatting

| Type | Display | Color |
|------|---------|-------|
| String | `"hello"` (truncated) | text |
| Number | `42` | primary |
| Boolean | `true` / `false` | success / error |
| null | `null` | textMuted |
| ObjectId | `507f1f77...` (first 8 chars) | secondary |
| Date | `2024-01-15` | warning |
| Array | `[3 items]` | textDim |
| Object | `{...}` | textDim |

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Mon-Q  mydb@localhost                    1,234 docs  [1/50] │
├──┬──────────────────────────────────────────────────────────┤
│  │ users                                                    │  <- Tab bar
├──┴──────────────────────────────────────────────────────────┤
│   _id          name          email              age  active │
│ > 507f1f77...  John Doe      john@example.com   32   true   │
│   507f1f78...  Jane Smith    jane@example.com   28   true   │
│   507f1f79...  Bob Wilson    bob@example.com    45   false  │
│   507f1f7a...  Alice Brown   alice@example.com  31   true   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

### Create
- `src/components/DocumentList.tsx` - Document table component

### Modify
- `src/App.tsx` - Add document list view
- `src/state.ts` - Add document list state
- `src/types.ts` - Add document types
- `src/providers/mongodb.ts` - Add document fetching
