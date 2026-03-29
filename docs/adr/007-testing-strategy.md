# ADR-007: Testing Strategy

**Status**: Accepted

## Decision
Only pure functions get tests. No component rendering tests, no MongoDB integration tests.

## Rationale
- Pure functions (parser, fuzzy match, format utils, schema detection, reducer slices) have deterministic input→output and high coverage value per line of test
- TUI component rendering tests are brittle, slow, and test the framework more than the app
- MongoDB integration tests require infrastructure and add CI complexity disproportionate to the confidence gained

## Consequences
- Test targets: `query/parser.ts`, `utils/fuzzy.ts`, `utils/format.ts`, `query/schema.ts`, reducer slice functions
- Test runner: `bun test`
- Tests live next to the file they test: `query/parser.test.ts`, `utils/fuzzy.test.ts`, etc.
