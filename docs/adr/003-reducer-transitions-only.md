# ADR-003: Reducer Contains Transitions Only

**Status**: Accepted

## Decision
Reducer cases compute the next state from the previous state and action payload. They do not perform data transformation, parsing, or business logic. Complex derivations happen before `dispatch`, in `query/` or `actions/`.

## Rationale
- Logic inside a reducer is hard to test in isolation — you must construct the full prior state
- A reducer that parses JSON or translates query formats has two reasons to change (state shape and parsing logic), violating single responsibility
- Pure transformation functions in `query/` or `utils/` are trivially testable and reusable

## Consequences
- `TOGGLE_QUERY_MODE` and `OPEN_QUERY_BSON` must not contain JSON parsing — call `filterToSimple` / `parseBsonQuery` before dispatching
- Any reducer case longer than ~20 lines is a signal that logic has leaked in
