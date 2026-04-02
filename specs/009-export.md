# Export

**Status**: In Progress

## Description

Export the current filtered document set as JSON or CSV via the command palette.

- **Simple/BSON mode**: re-queries MongoDB with the current filter, sort, and projection (no page limit)
- **Pipeline mode**: re-runs the full aggregation pipeline

Streams results to a file with percentage-based progress toasts. Cancellable via Escape with confirmation.

## Capabilities

### P1 - Must Have

- Export current filter/pipeline results as JSON (newline-delimited JSON objects)
- Export current filter/pipeline results as CSV
- Export to file: `./{db}-{collection}-{timestamp}.{ext}`
- Accessible via Ctrl+P command palette ("Export as JSON", "Export as CSV")
- Percentage progress toast (countDocuments first, then stream with running count)
- Cancel via Escape with confirmation dialog

### P2 - Should Have

- CSV: flatten nested objects to dot-notation columns (e.g. `address.city`)
- CSV: stringify arrays as JSON in the cell
- CSV column detection: scan first 100 docs to derive headers, then stream the rest

## Out of Scope

- Clipboard export (not needed)

## Technical Notes

### Data flow

1. User triggers "Export as JSON/CSV" from palette
2. Run `countDocuments()` (or pipeline with `$count`) to get total
3. Open write stream to output file
4. Stream documents via cursor, writing each to the file
5. Update progress toast periodically (every 500ms or 1000 docs)
6. On completion: success toast with file path
7. On Escape: confirmation dialog, abort cursor on confirm

### CSV column derivation

Pipeline results can have arbitrary shapes. Buffer the first 100 docs, extract all unique dot-notation paths, write the CSV header, flush the buffer as rows, then continue streaming. Fields appearing only in later docs are omitted from the header.

## File Structure

| File | Change |
|------|--------|
| `src/actions/export.ts` | Export logic: query/stream/write for JSON and CSV |
| `src/commands/builder.ts` | Add "Export as JSON" and "Export as CSV" palette entries |
| `src/state.ts` / reducers | Export progress state, cancel support |
