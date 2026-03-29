# ADR-001: State Shape — Grouped Sub-objects, Single Root Reducer

**Status**: Accepted

## Decision
`AppState` is organised into named sub-objects (`query`, `documents`, `ui`, `connection`). A single root reducer composes domain slice reducers, each responsible for its own sub-state.

## Rationale
- A flat bag of 40+ fields loses grouping — it's unclear which fields relate to each other
- Slice reducers are small, focused, and independently testable
- A single root reducer keeps the action type union global and avoids cross-slice coordination complexity

## Consequences
- New state fields go into the appropriate sub-object, never added flat to the root
- Actions that touch multiple slices are handled in the root reducer after delegating to slices
- Local UI state (open/closed, focused index, scroll position) stays in `useState` — see ADR-002
