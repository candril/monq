# Column Picker and Flattened Nested Columns

**Status**: Draft

## Description

Two gaps in how columns get chosen today.

**Nested projections don't flatten.** `+TvContract.Username` fetches only the
nested field, but the table still shows a `TvContract` column holding
`{"Username":"…"}`. Columns come from the top-level keys of the returned
documents, so the projection path is lost. A projected path should be its own
column, `TvContract.Username`, showing the bare value.

**Picking columns by typing tokens is slow.** `+field` / `-field` and the `-`
key work, but you need to know the field names and type them. Nested paths are
worse. A quick-pick overlay lists every field the schema knows, including dot
paths. You filter it by typing, toggle fields with Space and apply with Enter.

The picker doesn't add a second mechanism. It edits the projection tokens in
the simple query bar, so what it does stays visible in the bar and tab label.
It also survives tab switches, clone and undo-close, and converts to BSON like
any typed projection. `+`/`-` tokens and the `-` key keep working.

## Out of Scope

- Pipeline and BSON mode in P1/P2. The picker shows a toast there.
- Client-side-only column hiding, i.e. hiding without changing the query.
- Column renaming or aliases.
- `$unwind`. A flattened path through an array shows the collected array; it
  does not produce one row per element.
- Persisting a column choice per collection across sessions.

## Capabilities

### P1 - Must Have

- **Inclusion projections define the columns.** When the simple query has at
  least one `+path` token, the columns are exactly `_id` (unless `-_id`),
  followed by each included path in token order. They are not detected from
  the documents. `+TvContract.Username` gives the column `TvContract.Username`.
  Sort, `f`, `y`, width and search highlighting already work on dot paths
  through `getNestedValue`.
- **Paths through arrays collect values.** `getNestedValue` maps over arrays in
  the middle of a path, as MongoDB does. For `Items.Name` on
  `Items: [{Name:"a"},{Name:"b"}]` it returns `["a","b"]`. Nested arrays are
  flattened one level per array step, and missing values are dropped.
- **`-` under an inclusion projection removes the `+` token.** Today it adds
  `field: 0` next to the inclusions. That mixed projection is rejected by
  MongoDB. Removing the last `+` token returns to the default columns.
  `-` on `_id` still adds `-_id`, which MongoDB accepts alongside inclusions.
- **Column picker (`c`).** A centred overlay styled like the command palette.
  - Rows are every path in the schema map, in schema order, with `_id` first.
    Nested paths are indented under their parent, but the full path is what
    matches the filter.
  - Each row shows `◉` (shown) or `○` (hidden). The header shows the count, e.g.
    `columns 5/23`. The cursor row is marked `▸`.
  - Typing filters the rows fuzzily with the existing `fuzzyFilter`. Up/Down
    and Ctrl-N/Ctrl-P move the cursor. Space toggles the cursor row, and field
    names never contain spaces. Enter applies, and Esc discards the changes.
  - Initial state from the current query:
    - With an inclusion projection, the included paths are checked.
    - Otherwise every current top-level column is checked, except the
      excluded ones.
- **Ancestor/descendant exclusivity.** Checking `a.b` unchecks `a` and every
  `a.b.*`. Checking `a` unchecks every `a.*`. MongoDB rejects a projection that
  names both a path and its parent (path collision).
- **Apply encodes the minimal projection.** The picker rewrites only the
  projection tokens. Filter tokens and search terms stay where they are.
  - If the checked set equals the default top-level columns, all projection
    tokens are removed.
  - If no nested path is checked, the result is `-path` tokens for the
    unchecked top-level columns.
  - If any nested path is checked, the result is `+path` tokens for the
    checked paths. Previously included paths keep their order, and newly
    checked ones are appended. `-_id` is added if `_id` is unchecked.
  - Apply re-runs the query through `SUBMIT_QUERY`, as the `-` key does today.
- **Keymap and palette.** The remappable action is `view.column_picker`, bound
  to `c` by default. There is a palette entry, "Choose Columns…". It appears
  in `?` help.
- **Pipeline/BSON mode.** Pressing `c` shows the toast "Column picker works in
  simple mode".

### P2 - Should Have

- **Bulk toggles.** Ctrl-A toggles all *filtered* rows: if any is unchecked,
  all are checked; otherwise all are unchecked. The ancestor/descendant rule
  still applies. Typing `Contract` + Ctrl-A then selects every matching path.
- **Reset.** Ctrl-R restores the default columns, i.e. no projection tokens.
- **Type hints.** Each row shows the schema type dimmed on the right: `string`,
  `object`, `array<string>` and so on.
- **Header shows the leaf for deep paths.** A header wider than its column
  keeps the tail of the path, `…Contract.Username`, instead of cutting it at
  the end. The leaf is the part that tells columns apart.

### P3 - Nice to Have

- **Reorder.** Shift-J/Shift-K in the picker move a checked row. This only
  applies in inclusion mode, where the token order is the column order.
- **Pipeline mode.** The picker edits the trailing `$project` stage the way
  `hideColumnPipeline` does. Columns of a find-compatible pipeline with a
  dotted inclusion `$project` flatten the same way.

## Technical Notes

- `src/query/projection.ts` (new, pure) holds:
  - `projectionColumns(proj)`, the column list for an inclusion projection,
  - `encodePickerSelection(checked, defaults, previousOrder)`, which returns
    the token string,
  - `replaceProjectionTokens(input, tokens)`, which is lifted out of
    `hideColumnSimple`.
  `hideColumn.ts` then uses these helpers.
- `useDocumentLoader.ts`: in simple mode with inclusions, build the columns from
  `projectionColumns` and don't call `detectColumns`. Existing `displayMode`
  per field is kept as today.
- The picker's state (`columnPicker: { cursor, filter, checked } | null`) lives
  in the ui reducer. The key handling goes in `hooks/useColumnPickerKeys.ts`,
  and the rendering in `components/ColumnPicker.tsx`. `CommandPalette` is
  single-select with its own key loop, so it isn't generalised for this.
- Both `getNestedValue` implementations (`utils/format.ts` and
  `utils/document.ts`) get the array mapping. Merge them into one while there.
- Tests:
  - the loader column derivation,
  - `encodePickerSelection`, covering all three encodings, `_id`, and
    ancestor collisions,
  - `getNestedValue` through arrays,
  - `-` under an inclusion projection.
