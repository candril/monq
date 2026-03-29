# ADR-002: Local State First

**Status**: Accepted

## Decision
State that is only read and written by a single component lives in `useState`. It goes into the global reducer only when two or more unrelated components genuinely need it.

## Rationale
- Global state for UI-only concerns (scroll position, open/closed, focused index within an overlay) inflates the reducer and couples unrelated parts of the app
- Local state is easier to reason about, easier to test, and gets garbage-collected with the component
- The keyboard handler being global is not a valid reason to globalise state — the handler can call a ref or callback instead

## Consequences
- Confirm dialog `focusedIndex`, preview scroll offset, palette selection index, and similar UI state belong in the component
- When a keyboard handler needs to affect component-local state, prefer a `useImperativeHandle` ref or a scoped context over hoisting state to the global reducer
