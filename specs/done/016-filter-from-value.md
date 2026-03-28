# Filter from Value

**Status**: Done

## Description

Press `f` on any cell to instantly filter documents by that field's value. Works in both simple filter mode and pipeline mode. In simple mode it appends a `field:value` token. In pipeline mode it adds a condition to the `$match` stage of the active pipeline.

## Out of Scope

- Filter from value in BSON mode textareas
- Multi-value filter (OR conditions) from a single keypress

## Capabilities

### P1 - Must Have

- `f` on a selected cell appends `field:value` to the simple query and submits
- If cell value is `null` or absent, produces `field:null`
- Works on any column including nested dot-notation fields

### P2 - Should Have

- If a pipeline is active, adds `{ field: value }` as a new condition into the `$match` stage (`ADD_PIPELINE_MATCH_CONDITION`) rather than switching mode — **done**
- If no `$match` stage exists in the pipeline, creates one — **done**
- Available as a command palette entry (`doc:filter-value`) — **done**

## Implementation Notes

### Simple Mode Behavior

The `f` handler in `useKeyboardNav.ts`:
1. Gets the selected column name and current cell value
2. Calls `formatValue(value)` to get a string representation
3. Appends `column:formattedValue` to `queryInput` (with a space separator if non-empty)
4. Dispatches `SUBMIT_QUERY` to reload with the new filter

### Pipeline Mode Behavior

When `state.pipeline.length > 0`:
1. Dispatches `ADD_PIPELINE_MATCH_CONDITION` with `{ field, value }`
2. Reducer finds or creates the `$match` stage and merges the new condition
3. Dispatches `RELOAD_DOCUMENTS` to apply

### Null / Missing Cells

If `value === null` or `value === undefined`, filter token is `field:null` in simple mode, or `{ field: null }` in pipeline mode.

## Key Files

- `src/hooks/useKeyboardNav.ts` — `f` key handler (simple and pipeline branches)
- `src/state.ts` — `ADD_PIPELINE_MATCH_CONDITION` action and reducer
- `src/commands/builder.ts` — `doc:filter-value` palette command
- `src/utils/format.ts` — `formatValue()` used to serialize cell value as filter string

## Keyboard

| Key | Context | Action |
|-----|---------|--------|
| `f` | Document list (any mode) | Filter by selected cell's field:value |
