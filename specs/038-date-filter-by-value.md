# Date-aware filter-by-value

**Status**: Ready

## Description

Pressing `f` on a Date column produces a broken filter token like `date:Wed Jan 01 2025 00:00:00 GMT+0100` because `filterBySelectedValue` falls through to `String(val)` for Date objects. The result is not a valid query token and either matches nothing or causes a parse error.

Date values need special formatting so the generated filter token works with the query parser.

## Out of Scope

- Date range queries (e.g. `date:2025-01-01..2025-01-02`) — useful but a separate parser feature
- Timezone handling beyond what the Date object provides

## Capabilities

### P1 - Must Have

- `filterBySelectedValue` should detect Date instances and format them as ISO date strings (e.g. `date:2025-01-01`)
- In BSON mode, use `ISODate("2025-01-01T00:00:00.000Z")` format
- In pipeline mode, the `$match` condition should use a proper Date object, not a string

### P2 - Should Have

- When filtering by a date, generate a day-range filter instead of an exact match, since exact Date equality rarely makes sense:
  - Simple mode: `date:2025-01-01` → `{ date: { $gte: ISODate("2025-01-01"), $lt: ISODate("2025-01-02") } }`
  - This requires the query parser to understand date tokens as range queries
- Support other date-like types: `Timestamp`, `Long` epoch millis

### P3 - Nice to Have

- Show a visual hint in the filter bar when a date filter is active (e.g. calendar icon or date formatting)

## Technical Notes

The fix lives in `src/actions/filterValue.ts`. The `filterByValueSimple` function needs a Date branch:

```typescript
if (val instanceof Date) {
  formatted = val.toISOString().split("T")[0] // "2025-01-01"
}
```

For pipeline mode, `filterByValuePipeline` already passes the raw value to `ADD_PIPELINE_MATCH_CONDITION`, which preserves the Date type — so pipeline mode likely works correctly already. Verify.

## File Structure

| File | Change |
|------|--------|
| `src/actions/filterValue.ts` | Add Date branch to `filterByValueSimple` |
| `src/query/parser.ts` | (P2) Add date token parsing support |
