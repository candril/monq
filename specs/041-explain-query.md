# Explain Query

**Status**: Draft

## Description

On-demand query explain in the preview pane. Press a hotkey to run `explain("executionStats")` on the current query or pipeline and display the results as an ASCII-drawn execution plan tree in the preview pane. A separate preview mode — toggle between document preview and explain view.

## Out of Scope

- Auto-running explain on every query (too noisy, potential perf impact)
- Editing the explain output
- Suggesting indexes based on explain results

## Capabilities

### P1 - Must Have

- **Hotkey** (`x`) runs explain on the active query/pipeline
- **Explain preview mode**: replaces document preview with the explain plan
- Supports both `find()` queries and aggregation pipelines
- **ASCII execution plan tree** showing:
  - Scan type (`IXSCAN`, `COLLSCAN`, `FETCH`, etc.) with color coding
  - Index name and key spec (for `IXSCAN`)
  - Tree structure for nested stages (e.g. `FETCH → IXSCAN`)
- **Stats section** showing:
  - Docs examined vs returned
  - Keys examined
  - Execution time (ms)
- `COLLSCAN` highlighted in red as a warning
- `IXSCAN` shown in green
- Toggle back to document preview with `p` (existing key) or `x` again

### P2 - Should Have

- **Pipeline stage breakdown** for aggregation: per-stage execution info
- **Rejected plans** summary (how many alternatives were considered)
- **Ratio warning**: highlight docs examined / returned ratio when > 10x (suggests missing index)
- Scroll support (`Ctrl+D`/`Ctrl+U`) for long explain output

### P3 - Nice to Have

- Color-coded execution time (green < 10ms, yellow < 100ms, red > 100ms)
- Show index bounds / filter specificity
- "No index" suggestion when COLLSCAN detected on large collections

## Technical Notes

### MongoDB Driver API

```ts
// Find explain
const plan = await collection.find(filter).sort(sort).explain("executionStats")

// Aggregate explain
const plan = await collection.aggregate(pipeline).explain("executionStats")
```

The explain output has this structure (simplified):

```ts
{
  queryPlanner: {
    winningPlan: {
      stage: "FETCH" | "IXSCAN" | "COLLSCAN" | ...,
      inputStage?: { ... },     // nested stages
      indexName?: string,
      keyPattern?: object,
      direction?: string,
      indexBounds?: object,
    },
    rejectedPlans: [...],
  },
  executionStats: {
    executionTimeMillis: number,
    totalDocsExamined: number,
    totalKeysExamined: number,
    nReturned: number,
    executionStages: { ... },   // mirrors winningPlan with counts
  },
}
```

### Provider Layer

Add to `src/providers/mongodb.ts`:

```ts
export async function explainFind(
  collectionName: string,
  filter: Filter<Document>,
  options: { sort?: Record<string, 1 | -1>; projection?: Record<string, 0 | 1> },
): Promise<Document>

export async function explainAggregate(
  collectionName: string,
  pipeline: Document[],
): Promise<Document>
```

### Preview Pane Integration

The `DocumentPreview` component currently renders a single mode (JSON document). Add a `previewMode` state field:

```ts
type PreviewMode = "document" | "explain"
```

When `previewMode === "explain"`, render `ExplainPreview` instead of the JSON code block. The explain data is stored in state and updated on each explain run.

### ASCII Tree Rendering

Use box-drawing characters to render the execution plan:

```
  FETCH
  └─ IXSCAN  email_1
     ├─ index: { email: 1 }
     ├─ direction: forward
     └─ bounds: ["alice", "alice"]

  ── Stats ───────────────────────
  docs examined   1
  keys examined   1
  docs returned   1
  exec time       0ms
  ratio           1.0x ✓
```

For pipelines with multiple stages:

```
  $match
  └─ IXSCAN  status_idx
     └─ keys examined: 523

  $group
  └─ 500 → 12 groups

  $sort
  └─ in-memory sort on "total"

  ── Stats ───────────────────────
  docs examined   523
  exec time       12ms
```

Color coding via `<span fg={...}>`:
- `COLLSCAN` → `theme.error` (red)
- `IXSCAN` → `theme.success` (green)
- `FETCH`, `SORT` etc. → `theme.primary`
- Stats labels → `theme.textMuted`
- Stats values → `theme.text`
- Execution time > 100ms → `theme.warning`

### Extracting the Current Query

The explain action needs to reconstruct the same filter/sort/projection that `useDocumentLoader` uses. Extract the parsing logic into a shared helper in `src/utils/query.ts` (or similar) that both the document loader and explain can call:

```ts
function resolveCurrentQuery(state: AppState): {
  mode: "find"
  filter: Filter<Document>
  sort?: Record<string, 1 | -1>
  projection?: Record<string, 0 | 1>
} | {
  mode: "aggregate"
  pipeline: Document[]
}
```

### State

Additions to `AppState`:
- `previewMode: "document" | "explain"`
- `explainResult: Document | null` (raw explain output)
- `explainLoading: boolean`

New `AppAction` variants:
- `SET_PREVIEW_MODE`
- `SET_EXPLAIN_RESULT`
- `SET_EXPLAIN_LOADING`

## File Structure

| File | Change |
|------|--------|
| `src/providers/mongodb.ts` | Add `explainFind()`, `explainAggregate()` |
| `src/utils/query.ts` | New — `resolveCurrentQuery()` shared helper |
| `src/components/ExplainPreview.tsx` | New — ASCII-drawn explain plan renderer |
| `src/components/DocumentPreview.tsx` | Wrap with mode switch: document vs explain |
| `src/state.ts` | Add `previewMode`, `explainResult`, `explainLoading` |
| `src/types.ts` | Add `PreviewMode` type |
| `src/hooks/useDocumentEditKeys.ts` | Add `x` handler to trigger explain |
| `src/config/keymap.ts` | Add `explain.run` action with default `x` |
| `src/config/types.ts` | Add `"explain.run"` to `ActionName` |

## Keyboard

| Key | Context | Action |
|-----|---------|--------|
| `x` | Document list | Run explain on current query, switch preview to explain mode |
| `x` | Explain visible | Toggle back to document preview |
| `p` | Explain visible | Switch back to document preview |
| `Ctrl+D` / `Ctrl+U` | Explain visible | Scroll explain output |
