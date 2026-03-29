# ADR-005: Layer Boundaries

**Status**: Accepted

## Decision
Each layer has a single responsibility. Dependencies only flow inward: components → hooks/actions → utils/query → providers.

| Layer | Responsibility |
|---|---|
| `providers/` | DB connection and raw queries only |
| `actions/` | Async orchestration, editor spawning, file I/O |
| `query/` | Pure query parsing, translation, classification |
| `utils/` | Pure functions with no side effects |
| `components/` | Layout and render — no provider imports |

## Rationale
- `providers/mongodb.ts` containing `detectColumns` and `serializeDocument` means unrelated concerns change together
- A component importing from `providers/` directly makes it impossible to test or reuse without a DB connection

## Consequences
- `serializeDocument`, `deserializeDocument`, `detectColumns` move from `providers/mongodb.ts` to `utils/`
- `classifyPipeline`, `extractFindParts` move from `actions/pipeline.ts` to `query/`
- `DocumentPreview` stops importing from `providers/`
