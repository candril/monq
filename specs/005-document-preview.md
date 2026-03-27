# Document Preview

**Status**: Ready

## Description

A JSON tree view panel for the selected document, similar to PResto's preview panel. Shows the full document with collapsible nested objects and arrays. Supports drilling into subdocuments.

## Out of Scope

- Document editing (spec 007)
- Diff between documents

## Capabilities

### P1 - Must Have

- Toggle preview panel with `p` key
- Show full JSON of selected document
- Syntax highlighting for JSON (keys, strings, numbers, booleans, null)
- Preview position: right side or bottom (cycle with `P`)
- Scroll preview with `Ctrl+j` / `Ctrl+k`

### P2 - Should Have

- **Drill into subdocuments**: Press `Enter` on a nested object/array to "zoom in"
  - Breadcrumb shows path: `doc > address > coordinates`
  - Press `Backspace` to go back up
- Collapsible sections for nested objects/arrays
- Copy field value to clipboard (press `y` on a field)
- **Filter from value**: Press `f` on any field to add `field:value` to query bar

### P3 - Nice to Have

- Follow ObjectId references (detect ObjectId values, press `Enter` to look up)
- Show field types inline
- Pretty-print dates
- Show byte size of document

## Technical Notes

### JSON Tree Rendering

```typescript
interface TreeNode {
  key: string
  value: unknown
  type: "string" | "number" | "boolean" | "null" | "object" | "array" | "objectid" | "date"
  depth: number
  expanded: boolean
  path: string[] // Full path for drill-down and filter-from-value
}

// Flatten document into tree nodes for rendering
function flattenDocument(doc: Record<string, unknown>, maxDepth = 3): TreeNode[] {
  const nodes: TreeNode[] = []
  
  function walk(obj: Record<string, unknown>, depth: number, path: string[]) {
    for (const [key, value] of Object.entries(obj)) {
      const currentPath = [...path, key]
      const type = detectType(value)
      nodes.push({ key, value, type, depth, expanded: depth < 2, path: currentPath })
      
      if (type === "object" && depth < maxDepth) {
        walk(value as Record<string, unknown>, depth + 1, currentPath)
      }
    }
  }
  
  walk(doc, 0, [])
  return nodes
}
```

### Layout (right position)

```
┌──────────────────────────────┬──────────────────────────────┐
│ Document List                │ Document Preview             │
│                              │                              │
│   _id        name      age   │ {                            │
│ > 507f1f77   John      32    │   "_id": "507f1f77...",      │
│   507f1f78   Jane      28    │   "name": "John Doe",       │
│   507f1f79   Bob       45    │   "email": "john@ex.com",   │
│                              │   "age": 32,                │
│                              │   "address": {              │
│                              │     "street": "123 Main",   │
│                              │     "city": "London",       │
│                              │   },                        │
│                              │   "tags": ["admin", "user"] │
│                              │ }                           │
└──────────────────────────────┴──────────────────────────────┘
```

## File Structure

### Create
- `src/components/DocumentPreview.tsx` - JSON tree view component

### Modify
- `src/App.tsx` - Integrate preview panel
- `src/state.ts` - Add preview state (position, scroll, drill path)
