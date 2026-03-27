# Collection Tabs

**Status**: Ready

## Description

Open multiple collections in tabs, similar to browser tabs or PResto's tab system. Each tab maintains its own query, scroll position, and selected document.

## Out of Scope

- Cross-collection joins or comparisons
- Tab persistence across sessions
- Connection tabs (use separate instances)

## Capabilities

### P1 - Must Have

- Open a collection in a new tab (Enter from collection browser)
- Switch between tabs with `1-9` number keys or `gt`/`gT` (vim-style)
- Close tab with `x` or `Ctrl+w`
- Tab bar showing all open tabs with active indicator
- Each tab maintains independent state:
  - Query filter
  - Selected document index
  - Scroll position
  - Preview panel state

### P2 - Should Have

- Duplicate current tab (same collection, same query)
- Tab shows document count matching current query
- Close other tabs (keep only active)
- Undo close tab (`u`)

### P3 - Nice to Have

- Reorder tabs
- Tab title shows collection name + active query summary
- Notification dot when background tab data changes

## Technical Notes

### Tab State

```typescript
interface Tab {
  id: string
  collectionName: string
  query: string
  queryMode: "simple" | "bson"
  selectedIndex: number
  scrollOffset: number
  previewPosition: "right" | "bottom" | null
}
```

### Tab Bar Layout

```
┌─────────────────────────────────────────────────────────────┐
│ Mon-Q  mydb@localhost                         1,234 docs    │
├─────────────────────────────────────────────────────────────┤
│ [users (1,234)] [orders (45,678)] [products]                │  <- Tab bar
├─────────────────────────────────────────────────────────────┤
│   _id          name          email              age  active │
│ ...                                                         │
```

## File Structure

### Create
- `src/components/TabBar.tsx` - Tab bar component

### Modify
- `src/App.tsx` - Add tab management
- `src/state.ts` - Add tab state and actions
- `src/types.ts` - Add Tab type
