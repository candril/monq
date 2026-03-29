# Pluggable Data Source Backends

**Status**: Draft

## Description

Decouple Monq from MongoDB so that any tabular or document-oriented data source can be
browsed with the same keyboard-first interface. The first additional backend is CSV/TSV,
making Monq useful for local file exploration as well as remote databases.

## Out of Scope

- Schema migration or data transformation between backends
- Writing back to CSV (read-only for file backends)
- Joining or correlating data across multiple backends
- Any GUI connection manager / saved connections

---

## Capabilities

### P1 - Must Have

- **Backend abstraction** — a `DataSource` interface that all backends implement, hiding
  MongoDB-specific logic behind a common contract
- **CSV backend** — open a `.csv` or `.tsv` file as a "collection"; rows become documents,
  header row becomes field names
- **Backend detection from CLI arg** — `monq --file data.csv` opens the CSV backend;
  `monq --uri mongodb://...` opens the MongoDB backend (existing behaviour, unchanged)
- **Read operations** — list "collections" (for CSV, just the file name), fetch rows as
  documents, apply simple field-equality filters
- **Column display** — existing DocumentList auto-column logic works unchanged since rows
  are normalised to `Record<string, unknown>`

### P2 - Should Have

- **Filter compatibility** — simple `Key:Value` query mode works against CSV rows
  (in-memory filter since CSV has no query engine)
- **Type inference** — numbers and booleans in CSV cells are coerced to native types so
  comparisons and sorting work correctly
- **Multiple files as tabs** — `monq --file a.csv --file b.csv` opens each file as a
  separate tab, mirroring multi-collection behaviour
- **NDJSON / JSON Lines backend** — each line is a document; useful for log files and
  pipeline output

### P3 - Nice to Have

- **SQLite backend** — `monq --sqlite app.db`; each table is a "collection"; queries map
  to `SELECT … WHERE …` via the simple parser
- **stdin backend** — `cat data.json | monq` reads NDJSON from stdin, enabling pipeline
  use: `mongodump | monq`
- **Backend label in header** — header shows "CSV · data.csv" or "SQLite · app.db"
  instead of a MongoDB URI
- **Sort by column** — `<` / `>` to cycle sort field; backends that support it push sort
  to the query layer; CSV/JSON backends sort in-memory

---

## Technical Notes

### DataSource Interface

```typescript
// src/backends/types.ts

export interface CollectionInfo {
  name: string        // display name, e.g. filename or collection
  count?: number      // row/document count if cheap to obtain
}

export interface QueryOptions {
  filter?: Record<string, unknown>   // parsed simple or BSON filter
  limit?: number
  skip?: number
  sort?: Record<string, 1 | -1>
}

export interface DataSource {
  /** Human-readable label shown in the header, e.g. "mongodb://host/db" */
  readonly label: string

  /** Backend type tag for conditional UI logic */
  readonly kind: "mongodb" | "csv" | "ndjson" | "sqlite" | "stdin"

  /** Whether this backend supports writes (edit / insert / delete) */
  readonly writable: boolean

  /** List available "collections" (tables, files, …) */
  listCollections(): Promise<CollectionInfo[]>

  /** Fetch documents from a collection */
  query(collection: string, opts: QueryOptions): Promise<Record<string, unknown>[]>

  /** Count documents (may be approximate) */
  count(collection: string, filter?: Record<string, unknown>): Promise<number>

  /** Optional: update a single document by _id or row index */
  update?(collection: string, id: unknown, patch: Record<string, unknown>): Promise<void>

  /** Optional: delete a single document */
  delete?(collection: string, id: unknown): Promise<void>

  /** Clean up connections / file handles */
  close(): Promise<void>
}
```

### Backend Factory

```typescript
// src/backends/index.ts

export async function createBackend(args: CliArgs): Promise<DataSource> {
  if (args.uri)    return new MongoBackend(args.uri)
  if (args.file)   return new CsvBackend(args.file)
  if (args.sqlite) return new SqliteBackend(args.sqlite)
  // stdin detection: !process.stdin.isTTY
  throw new Error("No data source specified. Use --uri, --file, or --sqlite.")
}
```

### CSV Backend Sketch

```typescript
// src/backends/csv.ts
import { parse } from "csv-parse/sync"
import { readFileSync } from "fs"
import { basename } from "path"

export class CsvBackend implements DataSource {
  readonly kind = "csv" as const
  readonly writable = false
  readonly label: string

  private rows: Record<string, unknown>[]
  private filename: string

  constructor(filePath: string) {
    this.label = filePath
    this.filename = basename(filePath)
    const raw = readFileSync(filePath, "utf8")
    this.rows = parse(raw, { columns: true, cast: true, trim: true })
  }

  async listCollections() {
    return [{ name: this.filename, count: this.rows.length }]
  }

  async query(collection: string, { filter, limit = 50, skip = 0, sort }: QueryOptions) {
    let result = this.rows
    if (filter && Object.keys(filter).length) {
      result = result.filter(row => matchesFilter(row, filter))
    }
    if (sort) {
      const [field, dir] = Object.entries(sort)[0]
      result = [...result].sort((a, b) => {
        const av = a[field], bv = b[field]
        return av < bv ? -dir : av > bv ? dir : 0
      })
    }
    return result.slice(skip, skip + limit)
  }

  async count(collection: string, filter?: Record<string, unknown>) {
    if (!filter || !Object.keys(filter).length) return this.rows.length
    return this.rows.filter(r => matchesFilter(r, filter)).length
  }

  async close() {}
}
```

### Refactoring `providers/mongodb.ts`

Wrap the existing MongoDB provider in a `MongoBackend` class that satisfies `DataSource`.
The rest of the app (`useMongoConnection`, `useDocumentLoader`) receives a `DataSource`
instead of a raw `MongoClient` — no component changes needed beyond the hook layer.

### CLI Arg Expansion

```
monq --uri  <mongodb-uri>          # existing, unchanged
monq --file <path.csv>             # new: CSV/TSV backend
monq --file <a.csv> --file <b.csv> # new: multi-file tabs
monq --sqlite <path.db>            # P3: SQLite backend
```

---

## File Structure

| Path | Action |
|------|--------|
| `src/backends/types.ts` | New — `DataSource` interface, `CollectionInfo`, `QueryOptions` |
| `src/backends/index.ts` | New — `createBackend` factory |
| `src/backends/mongo.ts` | New — wrap existing `providers/mongodb.ts` in `MongoBackend` class |
| `src/backends/csv.ts` | New — `CsvBackend` implementation |
| `src/backends/ndjson.ts` | New (P2) — `NdjsonBackend` |
| `src/backends/sqlite.ts` | New (P3) — `SqliteBackend` |
| `src/backends/filter.ts` | New — in-memory `matchesFilter` for file-based backends |
| `src/providers/mongodb.ts` | Modify — re-export via `MongoBackend`; keep for backwards compat |
| `src/hooks/useMongoConnection.ts` | Modify — accept `DataSource` instead of raw client |
| `src/hooks/useDocumentLoader.ts` | Modify — accept `DataSource` |
| `src/index.tsx` | Modify — parse new CLI flags, call `createBackend` |
| `src/types.ts` | Modify — add `BackendKind`, replace `MongoClient` refs with `DataSource` |
