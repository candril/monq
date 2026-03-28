# Schema Map

**Status**: Done

## Description

Runtime schema detection from sampled documents. Builds a field-path → type map used to power field name suggestions in the query bar, `$elemMatch` auto-generation in the simple query parser, and JSON Schema sidecar files for LSP completions in the pipeline and document editors.

## Out of Scope

- Persisting the schema between sessions
- User-defined or externally sourced schemas
- Full BSON type introspection (subdocuments are typed as `object`, not recursed beyond one level for suggestions)

## Capabilities

### P1 - Must Have (all done)

- `buildSchemaMap(documents)`: walks up to 50 docs recursively, records `fieldPath → FieldInfo` — **done**
  - Handles nested objects (dot-notation paths) and first element of arrays
  - Marks fields as `mixed` when the same path has conflicting types across documents
  - Registers parent paths with `children` so dot-notation drill-down works
- `FieldType`: `string | number | boolean | null | object | array | objectid | date | mixed` — **done**
- `getSubfieldSuggestions(schema, prefix)`: returns child field names for a given parent path — **done**
- `getArrayAncestor(schema, fieldPath)`: finds the nearest array-type ancestor for `$elemMatch` auto-wrapping — **done**

### P2 - Should Have

- Schema passed to pipeline and document editor actions to generate JSON Schema sidecars — **done** (see specs 012, 013)

## Key Files

- `src/query/schema.ts` — `buildSchemaMap`, `getSubfieldSuggestions`, `getArrayAncestor`, `SchemaMap`, `FieldType`, `FieldInfo`
- `src/hooks/useDocumentLoader.ts` — calls `buildSchemaMap` after each fetch; dispatches `SET_SCHEMA`
- `src/state.ts` — `schemaMap: SchemaMap` field; `SET_SCHEMA` action
- `src/components/FilterSuggestions.tsx` — consumes `schemaMap` for dot-notation suggestions
- `src/query/parser.ts` — uses `getArrayAncestor` for `$elemMatch` generation
- `src/actions/pipeline.ts` — uses schema to build pipeline JSON Schema sidecar
- `src/actions/editMany.ts` — uses schema to build document editor JSON Schema sidecar
