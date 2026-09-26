# Global Search

**Status**: In Progress

## Description

Type words into the simple query bar without a field, and monq searches for them
across the collection's text fields as you type. `alice` finds every document
with "alice" in any string field. `alice status:active` narrows that to active
ones. There's no field to remember and no Enter to press.

Today a bare word in the simple bar is dropped silently. It now becomes a search
term.

MongoDB has no "search every field" operator, so monq builds one. It uses a
case-insensitive substring `$regex` per string field known from the schema,
OR-ed together. This works on every deployment and matches partial words. It
can't use an index, so every search scans the collection. Collections with a
text index can opt into `$text` instead, which is indexed but matches whole words.

## Out of Scope

- Atlas Search (`$search`). Atlas only, and it needs a search index.
- Searching fields the sampled schema never saw. Search covers what the schema
  knows, and the filter bar says how many fields that is.
- Per-collection field configuration in `config.toml`.
- Search in BSON mode or pipeline mode. Those modes already let you write any
  `$or` you want.
- Turning a search `$or` back into bare words when switching BSON → simple.
  `bsonToSimple` already keeps any filter it can't translate as raw BSON.

## Capabilities

### P1 - Must Have — Done

- **Bare terms are search terms.** In simple mode, a token that is not
  `field:value`, `field>v`, `+field`, `-field` or `@a` is a search term. A
  quoted bare token (`"new york"`) is one phrase term.
- **Regex engine.** Each term becomes
  `{ $or: [ { <field>: { $regex: <escaped term>, $options: "i" } }, … ] }` over
  every `string` field in the schema map, including dot paths such as
  `address.city`. Regex metacharacters in the term are escaped.
- **Terms AND together.** `alice berlin` matches documents that contain both,
  possibly in different fields. Search terms combine with field tokens through
  `$and`, so `alice status:active` works.
- **Field cap.** At most 40 fields go into one `$or`, which bounds query size on
  wide schemas. Fields are taken in schema order.
- **No searchable fields → match nothing.** The filter becomes `{ $expr: false }`
  rather than an empty `$or`, which MongoDB rejects.
- **Stable schema while searching.** When a query has search terms, the schema
  map from each result page is merged into the existing one instead of
  replacing it. A narrow result page can't shrink the field set for the next
  keystroke, and a zero-result search can't empty it.
- **Live search.** While the simple bar is open, editing the search terms
  re-runs the query after 300 ms without closing the bar:
  - It fires only when the search terms change. Editing `status:ac` → `status:act`
    with no bare term doesn't fire, because partial field tokens would flicker.
  - It needs at least 2 characters in every term. Deleting the last term
    fires once, which restores the unsearched result.
  - The current rows stay visible until the new page arrives, so there's no
    loading-screen flash on every keystroke.
  - A newer keystroke cancels the previous result: only the latest query's
    documents land.
  - Live runs don't write to query history. Enter still submits and records
    history as before.
- **Query timeout.** Queries with search terms run with `maxTimeMS: 10000` on
  both `find` and `countDocuments`. A failure while the bar is open shows a
  toast, not the error screen, so a timed-out keystroke doesn't knock you out of
  the bar.
- **Simple → BSON** shows the generated `$or`/`$and`, so the search isn't a
  black box.

### P2 - Should Have — Done

- **Type-aware terms (regex engine).** In addition to the string `$regex`, the
  same `$or` gets:
  - a 24-hex term → equality on `_id` and every `objectid` field,
  - a numeric term → equality on every `number` field,
  - a `YYYY-MM-DD` term → a day range on every `date` field.
- **Arrays of strings.** The schema records a scalar `itemType` for arrays
  whose sampled items share one type. `array` fields with `itemType: "string"`
  are searched too, because `$regex` on an array matches its elements.
- **Search indicator.** When the query has search terms, the filter bar shows
  the engine and the field count, e.g. `⌕ regex · 12 fields`.
- **Opt-in `$text` engine.** `Ctrl+T` in the open simple bar switches the
  active tab between `regex` and `text`:
  - Switching to `text` checks `listIndexes` for a text index. If there is none,
    a toast says so and the engine stays `regex`.
  - With `text`, the terms become one top-level
    `$text: { $search: "<terms, phrases quoted>" }`. Type-aware extras don't
    apply, because `$text` can't sit inside `$or`.
  - The engine is part of the tab snapshot, so it survives tab switches.
  - Toggling re-runs the query when it has search terms.

### P3 - Nice to Have

- **Match highlighting.** In the document list, the parts of a cell that match
  a search term (case-insensitive) render in the highlight colour. This works in
  both engines. With `text` it's approximate, because highlighting matches
  substrings and stemming isn't reproduced.

## Technical Notes

- `src/query/search.ts` (new, pure) holds everything search-specific, and
  `parser.ts` only collects the bare tokens:
  - `isSearchToken(token)`,
  - `searchableFields(schemaMap)`,
  - `buildSearchFilter(terms, schemaMap, engine)`,
  - `searchTermsOf(input)`, which is also used by the live-search hook, the
    indicator and highlighting.
- `parseSimpleQueryFull` takes an optional `searchEngine` and merges the search
  clause into the filter. `ParsedSimpleQuery` gains `searchTerms: string[]`.
- New action `LIVE_QUERY` in the query reducer. It behaves like `SUBMIT_QUERY`
  but keeps `queryVisible` and keeps `documents`.
- The history effect in `App.tsx` skips reloads that happen while
  `queryVisible` is true. A submit closes the bar in the same transition, so
  submits are still recorded.
- `hooks/useLiveSearch.ts` debounces the change in `searchTermsOf(queryInput)`
  and dispatches `LIVE_QUERY`.
- `fetchDocuments` gains a `maxTimeMS` option. The demo provider ignores it.
- The engine is stored as `searchEngine: "regex" | "text"` on `AppState` and on
  the tab snapshot.
- Demo provider, to match MongoDB's behaviour: `$regex` also tests array
  elements (as with `tags: /x/`), and dot paths traverse arrays of objects. It
  also implements `$text` over all string values, for a text index created in
  the demo session.
- `Ctrl+T` is the remappable `query.toggle_search_engine` action.
- `$text` sits at the top level of the filter, so field tokens AND with it:
  `alice status:active` → `{ $text: …, status: "active" }`.
