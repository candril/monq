# Deep Schema Extraction

**Status**: Done

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
- `children` list on array-of-objects fields includes the union of all sampled item keys (up to 5 items)
- Type conflicts across documents at the same path still marked as `mixed`
- Schema used in filter suggestions shows dot-notation completions (e.g. `members.` → suggests `members.name`, `members.role`)
- JSON Schema sidecars (`editMany`, `pipeline`) emit nested `properties` for object fields and `items.properties` for array-of-objects fields — no more flat `{ type: "object" }` for nested types
- Pipeline `$match` schema includes all dot-notation paths (e.g. `shipping.city`) for LSP completions
- Schema comment headers in editor files capped at 10 fields with `… and N more fields` overflow line

### P3 - Nice to Have
- Depth limit configurable via a parameter (default 3)
- Schema sampling limited to first N array items (default 5) to avoid performance issues on large arrays

## Technical Notes
- `buildSchemaMap` in `src/query/schema.ts`: `walk` takes a `depth` parameter; bails at `depth >= 3`; arrays sample up to 5 items and union their children; mixed arrays (any scalar among sampled items) produce no children
- `generateSchema` in `src/actions/editMany.ts`: replaced flat type map with recursive `fieldToJsonSchema` that builds nested `properties` / `items` from `SchemaMap` children
- `buildJsonSchema` in `src/actions/pipeline.ts`: `$match` properties now include all dot-notation paths from the schema map
- Comment headers in both `editMany.ts` and `pipeline.ts` capped at 10 fields

## File Structure
- Modified: `src/query/schema.ts`
- Modified: `src/query/schema.test.ts` (6 new tests)
- Modified: `src/actions/editMany.ts`
- Modified: `src/actions/pipeline.ts`
