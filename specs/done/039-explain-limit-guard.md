# Explain limit guard

**Status**: Done

## Description

When running `explain` on a query or pipeline that has no `$limit` stage, MongoDB executes the full query plan against the entire collection. On large collections this can take minutes. A sensible default limit should be injected for explain operations to keep response times fast.

## Out of Scope

- Changing the actual query behavior (only affects explain)
- User-configurable explain limit (can be added later)
- Make the explain limit configurable in `config.toml`

## Capabilities

### P1 - Must Have

- When `explainFind` is called without a limit, inject a reasonable default (e.g. 1000 or the current pageSize)
- When `explainAggregate` is called on a pipeline without a `$limit` stage, append `{ $limit: 1000 }` to the pipeline before explaining
- Show a toast or indicator that explain used a limited sample

### P2 - Should Have

- If the user's query already has a `$limit`, respect it and don't add another

## Technical Notes

The explain calls originate from:
- `src/actions/palette/view.ts` — `view:explain` and `view:explain-raw` commands
- `src/hooks/useDocumentLoader.ts` — Effect 3 (explain preview auto-refresh)

The fix would go in `src/providers/mongodb.ts` in `explainFind` and `explainAggregate`, or at the call sites.

## File Structure

| File | Change |
|------|--------|
| `src/providers/mongodb.ts` | Add limit parameter to `explainFind`/`explainAggregate` |
| `src/actions/palette/view.ts` | Pass limit when calling explain |
| `src/hooks/useDocumentLoader.ts` | Pass limit for auto-explain |
