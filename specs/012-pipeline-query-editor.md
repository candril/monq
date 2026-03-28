# Pipeline Query Editor

**Status**: In Progress

## Description

Open an aggregation pipeline in `$EDITOR` (nvim, vim, etc.) as a JSON5 file.
The user gets full IDE power — syntax highlighting, LSP completions via a generated
JSON Schema sidecar, and all editor motions. On save+quit monq parses the pipeline,
runs it as `aggregate()` or (for simple `$match`/`$sort`/`$project` only) as `find()`
for paging compatibility, and displays results. A readonly pipeline bar shows the
active pipeline compactly at the bottom.

## Out of Scope

- Live/streaming results while the editor is open
- Editing the pipeline without leaving the TUI (use simple filter bar for that)
- Pipeline stage validation beyond JSON5 parsing
- Full mongosh integration

## Capabilities

### P1 - Must Have

- **`Ctrl+F` opens `$EDITOR`** with a pre-populated `pipeline.json5` temp file
- **Pre-populate from current state**:
  - Active simple filter → translated to `{ $match: <filter> }` stage
  - Active sort → `{ $sort: <sort> }` stage
  - Active pipeline (if already set) → loaded as-is
  - Empty state → template with `$match`, `$sort`, `$project` stubs
- **JSON5 format** — unquoted keys, comments, trailing commas (no regex literals;
  use `{ $regex: "...", $options: "i" }` instead)
- **`$schema` reference** in the file pointing to a generated sidecar
  `.monq-pipeline-schema.json` for jsonls field-name completions
- **Parse on save+quit**: extract stages, detect pipeline type:
  - Only `$match` / `$sort` / `$project` (in any order, all optional) →
    run as `find(filter, { sort, projection })` for cursor-based paging
  - Any other stage (`$group`, `$lookup`, `$unwind`, `$limit`, etc.) →
    run as `collection.aggregate(pipeline)`
- **Readonly pipeline bar** at the bottom (replaces/extends the simple filter bar):
  - Shows active pipeline stages compactly, e.g.:
    `[pipeline] $match:{FamilyName:"s…"}  $sort:{FamilyName:1}`
  - `F` key (uppercase) toggles the bar expanded/collapsed
  - `Ctrl+F` from anywhere opens `$EDITOR`
  - `/` clears the pipeline and opens simple filter input
- **Error display**: if JSON5 parse fails, show error message, do not clear existing filter
- **Temp file location**: `$TMPDIR/monq/<collectionName>-pipeline.json5`
  (stable path → editor history, undo, etc. survive between opens)

### P2 - Should Have

- **JSON Schema sidecar** `.monq-pipeline-schema.json` generated from sampled
  schema — provides `$match` field-name completions via jsonls in nvim/VS Code
- **Count display**: show `N documents` in pipeline bar (aggregate may not support
  `countDocuments` — use `$count` stage internally for totals)
- **Clear pipeline**: `Backspace` when pipeline bar is visible clears back to
  unfiltered state (same as simple mode)
- **Stage summary**: pipeline bar shows up to 3 stages; truncates with `+N more`

### P3 - Nice to Have

- **`$facet` support** for pagination of aggregate results
- **Export pipeline results** (feeds into spec 009)
- **Pipeline history**: last N pipelines stored per collection in
  `~/.local/share/monq/<collection>/history.json5`

## Technical Notes

### File Template

```json5
// Mon-Q pipeline — Family @ test-DgGalaxusAbos
// Edit and save to apply. Ctrl+C or :q! to cancel.
//
// Completions: open .monq-pipeline-schema.json in the same directory
// with your LSP (jsonls) for field-name suggestions in $match.
{
  "$schema": "./.monq-pipeline-schema.json",

  pipeline: [
    // $match filters documents
    { $match: { /* FamilyName: "stefan" */ } },

    // $sort: 1 = ascending, -1 = descending
    { $sort: { _id: -1 } },

    // $project: 1 = include, 0 = exclude (remove to get all fields)
    // { $project: { FamilyName: 1, _id: 0 } },
  ],
}
```

### JSON Schema Sidecar

Generated from `state.schemaMap`. Structure:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema",
  "title": "Mon-Q Pipeline Schema — Family",
  "type": "object",
  "properties": {
    "pipeline": {
      "type": "array",
      "items": {
        "oneOf": [
          {
            "type": "object",
            "properties": {
              "$match": {
                "type": "object",
                "properties": {
                  "FamilyName": { "type": "string" },
                  "FamilyOwnerId": { "type": "number" },
                  "FamilyMembers": { "type": "array" }
                }
              }
            }
          },
          { "type": "object", "properties": { "$sort": { "type": "object" } } },
          { "type": "object", "properties": { "$project": { "type": "object" } } },
          { "type": "object", "properties": { "$group": { "type": "object" } } },
          { "type": "object", "properties": { "$lookup": { "type": "object" } } },
          { "type": "object", "properties": { "$unwind": { "type": "object" } } },
          { "type": "object", "properties": { "$limit": { "type": "number" } } },
          { "type": "object", "properties": { "$skip": { "type": "number" } } },
          { "type": "object", "properties": { "$count": { "type": "string" } } }
        ]
      }
    }
  }
}
```

### Parsing Pipeline

```typescript
import JSON5 from "json5"

const parsed = JSON5.parse(content)
const pipeline: Document[] = parsed.pipeline ?? []

// Classify
const stageNames = pipeline.map(s => Object.keys(s)[0])
const FIND_COMPATIBLE = new Set(["$match", "$sort", "$project"])
const isFindCompatible = stageNames.every(s => FIND_COMPATIBLE.has(s))

if (isFindCompatible) {
  const match = pipeline.find(s => "$match" in s)?.["$match"] ?? {}
  const sort  = pipeline.find(s => "$sort"  in s)?.["$sort"]
  const proj  = pipeline.find(s => "$project" in s)?.["$project"]
  // → fetchDocuments(collection, match, { sort, projection: proj })
} else {
  // → collection.aggregate(pipeline).toArray()
}
```

### Running Aggregate

Add `fetchAggregate` to `providers/mongodb.ts`:

```typescript
export async function fetchAggregate(
  collectionName: string,
  pipeline: Document[],
  options: { limit?: number } = {}
): Promise<{ documents: Document[]; count: number }>
```

For count with arbitrary pipelines, append `{ $count: "__count" }` as a separate
query (don't modify the user's pipeline).

### State Changes

```typescript
// New AppState fields
pipeline: Document[]          // active pipeline stages (empty = no pipeline)
pipelineSource: string        // raw JSON5 string (for re-opening editor with edits)
pipelineVisible: boolean      // whether the pipeline bar is expanded
pipelineIsAggregate: boolean  // true when pipeline can't use find()
```

### Key Bindings

| Key | Context | Action |
|-----|---------|--------|
| `Ctrl+F` | anywhere | Open `$EDITOR` with pipeline file |
| `F` | document view | Toggle pipeline bar expanded/collapsed |
| `/` | document view | Clear pipeline, open simple filter |
| `Backspace` | pipeline bar visible | Clear pipeline |

### Temp File Path

```typescript
import { tmpdir } from "os"
import { join } from "path"

const dir = join(tmpdir(), "monq", collectionName)
await mkdir(dir, { recursive: true })
const queryFile   = join(dir, "pipeline.json5")
const schemaFile  = join(dir, ".monq-pipeline-schema.json")
```

### Editor Integration (same pattern as document edit)

```typescript
import { spawnSync } from "child_process"

const editor = process.env.EDITOR ?? "vim"
renderer.pause()        // suspend TUI
spawnSync(editor, [queryFile], { stdio: "inherit" })
renderer.resume()       // restore TUI
```

## File Structure

### New Files
- `specs/012-pipeline-query-editor.md` — this spec
- `src/actions/pipeline.ts` — open editor, write/read temp files, generate schema
- `src/components/PipelineBar.tsx` — readonly pipeline bar at bottom
- `src/query/json5.ts` — thin wrapper around json5 package

### Modified Files
- `src/types.ts` — add `pipeline`, `pipelineSource`, `pipelineVisible`, `pipelineIsAggregate`
- `src/state.ts` — add pipeline actions + reducer cases
- `src/providers/mongodb.ts` — add `fetchAggregate()`
- `src/hooks/useDocumentLoader.ts` — use aggregate when `pipelineIsAggregate`
- `src/hooks/useKeyboardNav.ts` — `Ctrl+F` → open pipeline editor, `F` → toggle bar
- `src/App.tsx` — render `PipelineBar`, wire pipeline actions

## Dependencies

```bash
bun add json5
bun add --dev @types/json5  # if needed
```
