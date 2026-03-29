# Deep Schema Extraction

**Status**: Draft

## Description
Improve schema detection to walk nested objects and arrays-of-objects up to a configurable depth, exposing dot-notation paths for filter suggestions and column detection.

## Out of Scope
- Schema persistence between sessions
- User-editable schema overrides
- Handling circular references (documents should not have these)

## Capabilities

### P1 - Must Have
- Nested objects walked up to depth 3: `address.city`, `address.billing.street`
- Arrays-of-objects sampled and children exposed: `members.name`, `members.role`
- Arrays of scalars (`tags: ["a","b"]`) → type `array`, no children (unchanged)
- Mixed arrays (scalars + objects) → type `array`, no children
- Depth limit of 3 is enforced — paths deeper than 3 levels are ignored
- Existing `buildSchemaMap` tests remain green

### P2 - Should Have
- `children` list on array-of-objects fields includes the union of all sampled item keys
- Type conflicts across documents at the same path still marked as `mixed`
- Schema used in filter suggestions shows dot-notation completions (e.g. `members.` → suggests `members.name`, `members.role`)

### P3 - Nice to Have
- Depth limit configurable via a parameter (default 3)
- Schema sampling limited to first N array items (default 5) to avoid performance issues on large arrays

## Technical Notes
- `buildSchemaMap` in `src/query/schema.ts` is the only file to change
- The `walk` function already recurses into objects — extend it to recurse into array items
- Guard: `if (depth >= maxDepth) return` before recursing
- Array-of-objects detection: `Array.isArray(value) && value.some(v => typeof v === 'object' && v !== null)`
- Tests live in `src/query/schema.test.ts`

## File Structure
- Modify: `src/query/schema.ts`
- Modify: `src/query/schema.test.ts`
