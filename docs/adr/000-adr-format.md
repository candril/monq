# ADR-000: ADR Format and Purpose

**Status**: Accepted

## Decision
Use lightweight ADRs in `docs/adr/` to record architectural decisions. Each ADR is ~15 lines max. This file defines the format — every subsequent ADR is an example of it.

## Structure
```markdown
# ADR-NNN: Title

**Status**: Accepted | Superseded by ADR-XXX

## Decision
One or two sentences. What was decided?

## Rationale
- Why this and not the obvious alternative
- Key constraint or insight
- (optional third point)

## Consequences
- What this means in practice for contributors and agents
- Tradeoffs accepted
```

## Rationale
- Short ADRs get read; long ones get skipped
- The decision and rationale must be self-contained enough for an AI agent to act on without reading the full codebase
- One decision per file makes superseding and referencing precise
