# Column Picker and Flattened Nested Columns

**Status**: Done

## Description

Two gaps in how columns get chosen.

**Nested projections don't flatten.** `+TvContract.Username` fetches only the
nested field, but columns came from the top-level keys of the returned
documents, so the table showed a `TvContract` column holding
`{"Username":"…"}`. A projected path is now its own column,
`TvContract.Username`, showing the bare value.

**Picking columns by typing tokens is slow.** `+field` / `-field` and the `-`
key work, but you need to know the field names and type them. Nested paths are
worse. A quick-pick overlay lists every field the schema knows, including dot
paths. You filter it by typing, toggle fields with Space and apply with Enter.

The picker doesn't add a second mechanism. It edits the projection: the tokens
of the simple query or the pipeline's `$project`. What it does stays visible in
the bar and tab label. It also survives tab switches, clone and undo-close, and
converts to BSON like any typed projection. `+`/`-` tokens and the `-` key keep
working.

## Out of Scope

- The picker in BSON mode, which has its own projection field. `c` shows a
  toast there.
- A pipeline `$project` that computes fields (`{ x: "$a.b" }`). `c` and `-`
  show a toast, because rewriting it would drop the computed fields.
- Client-side-only column hiding, i.e. hiding without changing the query.
- Column renaming or aliases.
- `$unwind`. A flattened path through an array shows the collected array; it
  does not produce one row per element.
- Persisting a column choice per collection across sessions.

## Capabilities

### P1 - Must Have — Done

- **Inclusion projections define the columns.** When a find-mode projection
  includes at least one path, the columns are exactly `_id` followed by each
  included path in the order written. The projection can come from `+path`
  tokens or from BSON mode's projection field. The columns are not detected
  from the documents.
  - `+TvContract.Username` gives the column `TvContract.Username`.
  - `-_id` hides the `_id` column. The field is still fetched, for edit and
    delete.
  - Sort, `f`, `y`, width and search highlighting work on dot paths through
    `getNestedValue`.
- **Paths through arrays collect values.** `getNestedValue` maps over arrays in
  the middle of a path, as MongoDB does.
  - `Items.Name` on `Items: [{Name:"a"},{Name:"b"}]` gives `["a","b"]`.
  - A numeric step (`Items.1.Name`) still indexes.
  - Nested arrays are flattened one level per array step, and missing values
    are dropped.
- **`-` under an inclusion drops the `+` token.** MongoDB rejects a projection
  that mixes inclusions and exclusions.
  - Removing the last `+` token returns to the default columns.
  - `-` on `_id` still adds `-_id`, which MongoDB accepts alongside inclusions.
  - The same rule applies to a pipeline's `$project`.
- **Column picker (`c`).** A centred overlay styled like the command palette.
  - **Rows:** every path in the schema map plus any current column, with `_id`
    first. Each nested path sits directly under its parent, even when the
    schema discovered it later. Unfiltered, rows show the indented leaf name;
    while filtering, they show the full path, which is also what the fuzzy
    filter matches.
  - **Row marks:** `◉` (shown) or `○` (hidden). Shown rows also carry their
    column position. The header shows the count, e.g. `Columns 5/23 shown`,
    and the bottom line lists the keys.
  - **Keys:**
    - Typing filters the rows with `fuzzyFilter`.
    - Up/Down, Ctrl-P/N and Ctrl-K/J move the cursor. Ctrl-U/D move half a
      page.
    - Space toggles the row. Field names never contain spaces, so Space isn't
      needed for the filter.
    - Enter applies, and Esc discards the changes.
  - **Initial state:** with an inclusion, the included paths are checked in
    order. Otherwise every top-level path is checked, except the excluded ones.
- **Ancestor/descendant exclusivity.** Checking `a.b` unchecks `a` and every
  `a.b.*`. Checking `a` unchecks every `a.*`. MongoDB rejects a projection that
  names both a path and its parent.
- **Apply writes the smallest projection.** Only projection tokens are
  rewritten; filter tokens and search terms stay. The picker picks between
  three encodings:
  - **No projection** when the checked set is the default: every top-level
    path, in schema order.
  - **`+path` tokens in column order** when any of these holds:
    - a nested path is checked,
    - the order differs from the schema order,
    - fewer columns are shown than hidden.

    `-_id` is added when `_id` is unchecked.
  - **`-path` tokens** for the unchecked top-level paths otherwise.

  An apply that doesn't change the projection doesn't re-run the query.
- **Keymap and palette.** The remappable action is `doc.column_picker`, next to
  `doc.hide_column`, bound to `c` by default. The palette entry is "Choose
  Columns…". Both actions appear in `?` help.
- **BSON mode.** `c` shows a toast.

### P2 - Should Have — Done

- **Bulk toggles.** Ctrl-A toggles all *filtered* rows: if any is unchecked,
  all are checked; otherwise all are unchecked. Rows are checked in list order,
  so of a parent and its child the child wins.
- **Select none.** Ctrl-X hides every *filtered* row, so you can hand-pick a
  few with Space. Picks append to the column order, so they become the columns
  in the order they were checked. Enter does nothing while nothing is checked,
  and the header then says "pick at least one".
- **Reset.** Ctrl-R restores the default columns.
- **Type hints.** Each row shows the schema type dimmed: `string`, `object`,
  `array<string>`.
- **Header keeps the tail of deep paths.** A dotted header wider than its column
  is cut at the start (`~ct.Username`), because the leaf is the part that tells
  columns apart.

### P3 - Nice to Have — Done

- **Reorder.** Shift-↑/↓ move the row under the cursor one column earlier or
  later. Shift-J/K would have clashed with typing capital letters in the
  filter. A custom order is written as a `+path` list, because only that keeps
  it.
- **Pipeline mode.** The picker and `-` edit the pipeline's `$project` stage,
  appending one when there is none and removing it when the projection becomes
  empty. A trailing 0/1 `$project` flattens columns in both find-compatible
  and aggregate pipelines.

## Technical Notes

- `src/query/projection.ts` (pure) holds `isInclusion`, `isPlainProjection`,
  `projectionColumns` (inclusion → column list) and
  `replaceProjectionTokens`.
- `src/query/columnPicker.ts` (pure) holds `pickerRows`, `defaultColumns`,
  `initialChecked`, `togglePath`, `toggleAll`, `moveChecked`, `needsInclusion`
  and `encodeSelection`.
- `src/actions/projectionEdit.ts` reads and writes the active tab's
  projection, simple or pipeline. `hideColumn` and the picker share it.
- `src/actions/columnPicker.ts` holds `openColumnPicker`, which carries the mode
  and computed-`$project` guards, `columnPickerModel` and `applyColumnPicker`.
- The app state has only `columnPickerVisible` (`OPEN_`/`CLOSE_COLUMN_PICKER` in
  the ui reducer).
  - `ColumnPickerOverlay` snapshots the model when it mounts.
  - `ColumnPicker` keeps the cursor, filter and checked set in a local
    reducer (`columnPickerReducer.ts`). Keys that arrive in one input chunk, like
    a fast `↓` + Space, each act on the result of the one before. Separate
    `useState`s would read a stale render.
- `useDocumentLoader.ts` builds the columns from `projectionColumns` when there
  is an inclusion, and doesn't carry over earlier columns then.
- `getNestedValue` is one function in `utils/document.ts`. `utils/format.ts` had
  a second copy.
- The demo provider projects dotted paths as MongoDB does. An inclusion nests
  (`{ address: { street } }`) through arrays of objects. An exclusion removes
  only the nested field.
