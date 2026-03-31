# Fix: Stale Documents After Filtering When Paged

**Status**: Ready

## Description

When the user pages through a collection with `ctrl-d` (LOAD_MORE) and then applies
a filter in the simple query bar, the result list contains stale/duplicate documents
from before the filter, and keyboard navigation appears broken. The root cause is that
`SUBMIT_QUERY` and `CLEAR_QUERY` do not reset pagination state (`loadingMore`,
`loadedCount`, `documents`) before the new query fetch begins.

## Out of Scope

- Changes to the paging UX or page size
- Cancellation of in-flight MongoDB cursor fetches at the driver level

---

## Capabilities

### P1 — Must Have

- **No stale documents after filter** — applying a filter while a paged list is loaded
  must immediately clear the document list and show only results matching the new query.
- **No duplicates** — an in-flight `LOAD_MORE` fetch that resolves after a filter is
  applied must be discarded, not appended to the new result set.
- **Navigation works after filtering** — `j/k/ctrl-d/ctrl-u` must behave correctly
  on the freshly-filtered list; `selectedIndex` must be within bounds.
- **Same fix applies to `CLEAR_QUERY`** — clearing the filter from a paged state has
  the same bug; it must also reset pagination state.

---

## Technical Notes

### Root cause

`SUBMIT_QUERY` (`state.ts:874`) and `CLEAR_QUERY` (`state.ts:888`) do not reset:

- `documents` — stale list remains visible until `SET_DOCUMENTS` arrives
- `loadedCount` — stays at the old page offset, corrupting subsequent `LOAD_MORE` skip values
- `loadingMore` — stays `true` if a `LOAD_MORE` was in flight; Effect 2's cleanup in
  `useDocumentLoader.ts` is gated on `loadingMore` changing, so the old fetch promise
  is never cancelled and dispatches `APPEND_DOCUMENTS` against the new filtered list

`RELOAD_DOCUMENTS` (`state.ts:607`) already resets `loadedCount: 0` and
`loadingMore: false` correctly; `SUBMIT_QUERY`/`CLEAR_QUERY` must replicate this.

### Fix

Add three fields to both `SUBMIT_QUERY` and `CLEAR_QUERY` in `src/state.ts`:

```typescript
documents: [],      // clear stale list immediately
loadedCount: 0,     // reset page offset
loadingMore: false, // cancel in-flight LOAD_MORE; triggers Effect 2 cleanup
```

Setting `loadingMore: false` when it was previously `true` causes the
`[activeTab?.id, state.loadingMore]` dependency array in Effect 2 to change,
running its `cancelled = true` cleanup and discarding the stale fetch result.

### Affected locations

| File | Line | Change |
|------|------|--------|
| `src/state.ts` | ~874 | `SUBMIT_QUERY` — add `documents: [], loadedCount: 0, loadingMore: false` |
| `src/state.ts` | ~888 | `CLEAR_QUERY` — same three fields |

No changes required to `useDocumentLoader.ts` — the existing `cancelled` guard and
Effect 2 cleanup already handle cancellation correctly once `loadingMore` is reset.

---

## File Structure

**Modified files:**
```
src/state.ts    # SUBMIT_QUERY and CLEAR_QUERY reducers
```
