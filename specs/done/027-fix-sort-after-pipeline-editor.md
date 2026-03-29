# Fix Column Sort After Pipeline Editor

**Status**: Done

## Description
After opening and closing the pipeline editor (Ctrl+F), sorting by column (`s` key) stops working.

## Likely Cause
After `openPipelineEditor` returns, sort state (`sortField`, `sortDirection`) may be reset or the pipeline source overwrites the sort stage, leaving the app in a state where `CYCLE_SORT` dispatches correctly but has no effect on the query being executed.

## Out of Scope
- Changing sort UI
- Pipeline stage reordering

## Capabilities

### P1 - Must Have
- `s` on a column sorts correctly after returning from Ctrl+F
- Sort works whether the pipeline was saved or cancelled
