# Explain: Eager Refresh on Query Change

**Status**: Draft

## Description

When the explain panel is open, changing the query requires waiting for the document fetch to complete before the explain result updates. This makes the explain feel sluggish — the user edits the query, submits, watches the document list reload, and only then sees the explain plan refresh.

The explain should start updating immediately when the query is submitted, in parallel with the document fetch, rather than waiting for `documentsLoading` to trigger it.

## Out of Scope

- Auto-running explain when the panel is not open
- Live-as-you-type explain (only on query submit)
- Changes to the explain rendering or stage display

---

## Capabilities

### P1 — Must Have

- When the explain panel is open and the user submits a new query (Enter in filter bar, or pipeline save), the explain query fires immediately — not after the document fetch starts/completes
- The explain loading spinner appears instantly on submit, giving immediate feedback
- If the user submits another query before the previous explain finishes, the in-flight explain is cancelled

### P2 — Should Have

- The explain and document queries run fully in parallel with no sequencing dependency between them
- If the explain finishes before documents, the explain panel updates immediately without waiting for the document list

### P3 — Nice to Have

- Show a subtle visual indicator (e.g. dim the old explain result) while the new explain is loading, so the user can still read the previous plan during the refresh

---

## Technical Notes

### Current behavior

The explain refresh is triggered by Effect 3 in `useDocumentLoader.ts` (lines 262-291). It watches `documentsLoading` — when documents start loading and `previewMode === "explain"`, it fires the explain query. This creates an indirect dependency: query change -> document fetch starts -> `documentsLoading` becomes true -> explain fires.

### Proposed change

Fire the explain query directly from the query submit path rather than indirectly via the document loading effect.

Option A — **Dispatch-driven**: When the query is submitted (e.g. `SUBMIT_QUERY`, `SET_PIPELINE_RESULT`), if `previewMode === "explain"`, immediately fire the explain query from the same handler that triggers the document fetch. This could live in `useDocumentLoader.ts` by watching the query/pipeline state directly instead of `documentsLoading`.

Option B — **Effect on query state**: Add a new effect that watches the resolved query (filter text + sort + mode) and fires explain when it changes, independent of document loading. This decouples explain from the document fetch entirely.

Either way, the existing cancellation pattern (AbortController per effect cycle) should be preserved to avoid stale results.

### File Structure

**Modified files:**
```
src/hooks/useDocumentLoader.ts   # decouple explain trigger from documentsLoading
```
