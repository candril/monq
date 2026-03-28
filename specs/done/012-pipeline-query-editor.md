# Pipeline Query Editor

**Status**: Done

## Description

Open an aggregation pipeline in `$EDITOR` (nvim, vim, etc.) as a JSONC file.
The user gets full IDE power — syntax highlighting, LSP completions via a generated
JSON Schema sidecar, and all editor motions. On save+quit monq parses the pipeline,
runs it as `aggregate()` or (for simple `$match`/`$sort`/`$project` only) as `find()`
for paging compatibility, and displays results. A readonly pipeline bar shows the
active pipeline compactly at the bottom.

## Out of Scope

- Live/streaming results while the editor is open
- Editing the pipeline without leaving the TUI (use simple filter bar for that)
- Pipeline stage validation beyond JSON parsing
- Full mongosh integration

## Capabilities

### P1 - Must Have

- **`Ctrl+F` opens `$EDITOR`** with a pre-populated `pipeline.jsonc` temp file
- **Pre-populate from current state**:
  - Active simple filter → translated to `{ $match: <filter> }` stage
  - Active sort → `{ $sort: <sort> }` stage
  - Active pipeline (if already set) → loaded as-is
  - Empty state → template with `$match`, `$sort`, `$project` stubs
- **JSONC format** — supports `//` comments and trailing commas; uses `.jsonc` extension so editors (nvim jsonls) activate automatically
- **`$schema` reference** in the file pointing to a generated sidecar `.monq-pipeline-schema.json` for jsonls field-name completions
- **Parse on save+quit**: extract stages, detect pipeline type:
  - Only `$match` / `$sort` / `$project` (in any order, all optional) → run as `find(filter, { sort, projection })` for cursor-based paging
  - Any other stage (`$group`, `$lookup`, `$unwind`, `$limit`, etc.) → run as `collection.aggregate(pipeline)`
- **Edit-parse loop**: if parsing fails, error injected as comment at top of file and editor re-opened automatically
- **Readonly pipeline bar** at the bottom (replaces/extends the simple filter bar):
  - Shows active pipeline stages compactly, e.g. `[pipeline] $match:{FamilyName:"s…"}  $sort:{FamilyName:1}`
  - `F` key (uppercase) toggles the bar expanded/collapsed
  - `Ctrl+F` from anywhere opens `$EDITOR`
  - `/` clears the pipeline and opens simple filter input
- **Temp file location**: `$TMPDIR/monq/<dbName>/<collectionName>/<tabId>/pipeline.jsonc` — scoped to db + collection + tab so multiple tabs on the same collection, or the same collection name across different databases, never share a file. Stable per tab → editor history and undo survive repeated `Ctrl+F` opens within the same tab. See spec 018 for the path change details.

### P2 - Should Have

- **JSON Schema sidecar** `.monq-pipeline-schema.json` generated from sampled schema — provides `$match` field-name completions with per-field types via jsonls in nvim/VS Code — **done**
- **Stage summary**: pipeline bar shows up to 3 stages; truncates with `+N more` — **done**
- **Clear pipeline**: `Backspace` when pipeline bar is visible clears back to unfiltered state — **done**
- **Count display**: show `N documents` in pipeline bar — **not yet implemented**

### P3 - Nice to Have

- `$facet` support for pagination of aggregate results
- Export pipeline results (feeds into spec 009)
- Pipeline history: last N pipelines stored per collection

## Implementation Notes

### Temp File Path

```typescript
const dir = join(tmpdir(), "monq", dbName, collectionName, tabId)
const queryFile  = join(dir, "pipeline.jsonc")
const schemaFile = join(dir, ".monq-pipeline-schema.json")
```

- `dbName` — prevents collisions when two databases have identically-named collections
- `collectionName` — keeps the path human-readable when browsing `$TMPDIR/monq/`
- `tabId` — `Tab.id` from `src/types.ts`; stable for the lifetime of a tab, new on clone/open

### File Format

The pipeline file uses `.jsonc` (JSON with Comments), not `.json5`. This gives:
- `//` and `/* */` comment support
- Trailing commas
- Automatic jsonls activation in nvim/VS Code without configuration

### Cursor Positioning

`buildEditorArgs()` in `src/actions/pipeline.ts` generates vim/nvim `-c` flags to position the cursor inside the `$match` value on open (e.g. `+call cursor(line, col)`). Supports vim, nvim, vi, nano.

### Edit-Parse Loop

When JSON parsing fails after save+quit, the error is injected as a `// ERROR: ...` comment block at the top of the file and the editor is re-opened. The user can fix the syntax and save again. The loop exits on successful parse or if the user cancels (`:q!`).

### Schema Sidecar

Generated from `state.schemaMap` — maps each field path to its detected type. Includes full MongoDB operator completions (`$match`, `$sort`, `$project`, `$group`, `$lookup`, `$unwind`, `$limit`, `$skip`, `$count`) as `oneOf` items in the pipeline array schema.

### Key Bindings

| Key | Context | Action |
|-----|---------|--------|
| `Ctrl+F` | anywhere | Open `$EDITOR` with pipeline file |
| `F` | document view | Toggle pipeline bar expanded/collapsed |
| `Shift+F` | simple filter active | Preview simple filter as pipeline stages |
| `/` | document view | Clear pipeline, open simple filter |
| `Backspace` | pipeline bar visible | Clear pipeline |

## Key Files

- `src/actions/pipeline.ts` — `openPipelineEditor()`, `classifyPipeline()`, `extractFindParts()`, `buildEditorArgs()`
- `src/components/PipelineBar.tsx` — Readonly pipeline bar (collapsed/expanded)
- `src/state.ts` — `SET_PIPELINE`, `CLEAR_PIPELINE`, `TOGGLE_PIPELINE_BAR`, `SHOW_PIPELINE_BAR`, `SHOW_SIMPLE_AS_PIPELINE`, `CLEAR_PREVIEW_PIPELINE`, `ADD_PIPELINE_MATCH_CONDITION`
- `src/hooks/useKeyboardNav.ts` — `Ctrl+F`, `F`, `Shift+F`, `/`, `Backspace` handlers
- `src/hooks/useDocumentLoader.ts` — uses `fetchAggregate()` when `pipelineIsAggregate`
- `src/providers/mongodb.ts` — `fetchAggregate(name, pipeline, options)`
