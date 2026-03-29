# ADR-004: Components Do Layout and Render Only

**Status**: Accepted

## Decision
Components handle layout, render, and local UI state. Business logic, async orchestration, editor spawning, and MongoDB calls belong in `actions/` or dedicated hooks — never inline in a component.

## Rationale
- A component with async orchestration has multiple reasons to change (UI and business logic)
- Logic in components is harder to test and harder to reuse
- ~150 lines is a soft ceiling — exceeding it is a signal to ask whether concerns are mixed

## Consequences
- `handlePaletteSelect` in `App.tsx` moves to a `usePaletteActions` hook
- Duplicated delete-with-confirm logic is extracted and shared, not copy-pasted
- Components never import directly from `providers/` — see ADR-005
