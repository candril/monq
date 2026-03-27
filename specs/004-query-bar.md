# Query Bar

**Status**: Ready

## Description

A dual-mode query bar for filtering documents. Simple mode uses human-readable `Key:Value` syntax that auto-converts to MongoDB queries. BSON mode allows raw MongoDB filter JSON. The query bar also supports filtering on current values from selected documents.

## Out of Scope

- Aggregation pipelines
- Query history / saved queries (future spec)
- Index-aware query suggestions

## Capabilities

### P1 - Must Have

- **Simple mode** (default): Parse `Key:Value` pairs into MongoDB filters
  - `Author:Peter` -> `{ "Author": "Peter" }`
  - `Author:Peter State:Closed` -> `{ "Author": "Peter", "State": "Closed" }`
  - Multiple pairs combined with `$and`
- **BSON mode**: Raw MongoDB filter JSON input
  - `{ "age": { "$gt": 25 } }`
  - Syntax validation before executing
- Toggle between modes with `Tab` key
- Show current mode indicator (Simple / BSON)
- Execute query on Enter
- Clear query with Escape
- Open query bar with `/`

### P2 - Should Have

- **Comparison operators** in simple mode:
  - `age>25` -> `{ "age": { "$gt": 25 } }`
  - `age>=25` -> `{ "age": { "$gte": 25 } }`
  - `age<25` -> `{ "age": { "$lt": 25 } }`
  - `count!=0` -> `{ "count": { "$ne": 0 } }`
- **Regex** in simple mode:
  - `name:/^john/i` -> `{ "name": { "$regex": "^john", "$options": "i" } }`
- **Filter from value**: Select a value in document preview and press `f` to create a filter for that field=value
- **Auto-detect value types**: Numbers parsed as numbers, not strings
- Live results (debounced, update as you type)

### P3 - Nice to Have

- **Nested field** queries: `address.city:London` -> `{ "address.city": "London" }`
- **Null checks**: `email:null` -> `{ "email": null }`
- **Exists checks**: `email:exists` -> `{ "email": { "$exists": true } }`
- Query suggestions based on known field names
- Query history with up/down arrows

## Technical Notes

### Simple Query Parser

```typescript
interface SimpleQuery {
  field: string
  operator: "eq" | "gt" | "gte" | "lt" | "lte" | "ne" | "regex"
  value: string | number | boolean | null | RegExp
}

function parseSimpleQuery(input: string): Record<string, unknown> {
  const tokens = tokenize(input) // Split by spaces, respecting quotes
  const filter: Record<string, unknown> = {}
  
  for (const token of tokens) {
    // Key:Value pattern
    const colonMatch = token.match(/^(\w[\w.]*):(.+)$/)
    if (colonMatch) {
      const [, field, value] = colonMatch
      filter[field] = coerceValue(value)
      continue
    }
    
    // Key>Value, Key>=Value, Key<Value, Key<=Value, Key!=Value
    const opMatch = token.match(/^(\w[\w.]*)(>=|<=|!=|>|<)(.+)$/)
    if (opMatch) {
      const [, field, op, value] = opMatch
      const mongoOp = { ">": "$gt", ">=": "$gte", "<": "$lt", "<=": "$lte", "!=": "$ne" }[op]
      filter[field] = { [mongoOp!]: coerceValue(value) }
      continue
    }
  }
  
  return filter
}

function coerceValue(value: string): string | number | boolean | null {
  if (value === "null") return null
  if (value === "true") return true
  if (value === "false") return false
  const num = Number(value)
  if (!isNaN(num) && value.trim() !== "") return num
  // Strip quotes if present
  if ((value.startsWith('"') && value.endsWith('"')) || 
      (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}
```

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│   _id          name          email              age  active │
│ > 507f1f77...  John Doe      john@example.com   32   true   │
│   507f1f79...  Bob Wilson    bob@example.com    45   false  │
├─────────────────────────────────────────────────────────────┤
│ [Simple] / Author:Peter age>25                              │  <- Query bar
└─────────────────────────────────────────────────────────────┘
```

## File Structure

### Create
- `src/query/parser.ts` - Simple query parser
- `src/query/types.ts` - Query type definitions
- `src/components/QueryBar.tsx` - Query bar component

### Modify
- `src/App.tsx` - Integrate query bar
- `src/state.ts` - Add query state
- `src/providers/mongodb.ts` - Add filtered queries
