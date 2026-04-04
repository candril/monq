# Pipeline $limit mutation bug

**Status**: Done

## Description

`fetchAggregate` in `src/providers/mongodb.ts:123` calls `.limit(pageSize)` on the aggregation cursor. The MongoDB Node.js driver's `AggregationCursor.limit()` appends a `{ $limit: N }` stage to the pipeline array via `addStage()`. Because `state.pipeline` is passed by reference, this **mutates React state directly**, appending a `$limit` stage to the live pipeline array on every fetch cycle.

Each reload (sort change, manual reload, watcher trigger) appends another `$limit: <pageSize>` stage, producing the accumulation visible in the PipelineBar (e.g. 6 extra `$limit: 73` stages after 6 reloads).

## Root Cause

```typescript
// src/providers/mongodb.ts:123
collection.aggregate(pipeline).limit(limit).toArray()
//                   ^^^^^^^^         ^^^^^
//                   same array ref   mutates it via addStage()
```

## Out of Scope

- Per-tab pipeline state (separate bug, see spec 037)
- The explain path (`explainAggregate`) does not use `.limit()` and is not affected

## Fix

### P1 - Must Have

- **Clone the pipeline before passing to the driver.** Replace:
  ```typescript
  collection.aggregate(pipeline).limit(limit).toArray()
  ```
  with:
  ```typescript
  collection.aggregate([...pipeline, { $limit: limit }]).toArray()
  ```
  This makes the limit explicit as a pipeline stage (which is what the driver does internally) while keeping `pipeline` unmodified.

- Alternatively, spread-clone first:
  ```typescript
  collection.aggregate([...pipeline]).limit(limit).toArray()
  ```
  Either approach prevents mutation. The explicit `$limit` stage is preferred because it makes the intent clear.

- **Also clone for the count pipeline** (line 120) — this already spreads (`[...pipeline, { $count: "__count" }]`) so it's safe, but verify.

### P2 - Should Have

- Consider whether the page-size `$limit` should be appended when the user's pipeline already contains a `$limit` stage. If the user wrote `{ $limit: 200 }` and pageSize is 73, the cursor-level limit of 73 silently overrides their intent. The fix should respect the user's `$limit` by skipping the injection when one exists.

## File Structure

| File | Change |
|------|--------|
| `src/providers/mongodb.ts` | Clone pipeline array before `.aggregate()` call |

## Verification

1. Open a pipeline with `$match` + `$limit: 200`
2. Sort by a column (CYCLE_SORT) — should not accumulate `$limit` stages
3. Reload multiple times — PipelineBar should show the user's stages only
4. Verify documents are still limited to pageSize (functional limit still applies)
