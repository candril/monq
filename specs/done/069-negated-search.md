# Negated Search Terms

**Status**: Done

## Description

`!stefan` in the simple bar hides every document that contains "stefan" in any
searchable field. It is the inverse of a bare search term (spec 067), and it
combines with positive terms: `alice !berlin` finds documents with "alice"
somewhere and "berlin" nowhere.

The obvious spelling, `-stefan`, is taken. A bare `-word` excludes the field
`word` from the projection (spec 024). Deciding between the two readings by
checking whether `word` is a known field would turn a typo'd field name into a
search without any warning, so negation gets its own prefix.

## Out of Scope

- Changing the meaning of `-word`.
- Negated field tokens. `-field:value` already exists.

## Capabilities

### P1 - Must Have — Done

- **Token.** `!term` and `!"a phrase"` are negated search terms. A bare `!`
  is ignored, and so is `!` followed only by whitespace.
- **Regex engine.** Each negated term becomes `{ $nor: [ <the same per-field
  $or the positive term would build> ] }`. That includes the type-aware
  extras, so `!6ab7…` excludes that ObjectId. Negated clauses AND with
  everything else. A document that lacks every searchable field matches, since
  nothing in it contains the term.
- **No searchable fields.** A negated term then excludes nothing and is dropped.
  This is the opposite of a positive term, which matches nothing.
- **Live search** treats a negated term like a positive one: 2-character
  minimum, excluding the `!`, and the same debounce and cancellation.
- **Indicator** counts both kinds, e.g. `⌕ regex · 12 fields · 1 excluded`.
- **Highlighting** skips negated terms. By construction they don't appear in
  the results.

### P2 - Should Have — Done

- **Text engine.**
  - With at least one positive term, negated terms go into `$search` as
    `-term` / `-"a phrase"`. That is native `$text` negation.
  - With only negated terms, `$text` returns nothing, because it needs a
    positive term. Those terms then use the regex `$nor`, and the indicator
    shows `regex` for that query.
- **Suggestions.** `!` at the start of a token doesn't trigger field-name
  completion.

## Technical Notes

- `search.ts`:
  - `isSearchToken` accepts a leading `!`, but only when no other operator
    character follows it.
  - `allSearchTermsOf` returns `{ text, negated }[]`; `searchTermsOf` keeps
    returning positive terms only, for highlighting. `searchKeyOf` is what
    live search compares, so adding or removing a `!` re-runs the query.
  - `buildSearchFilter` takes both lists.
- `parser.ts` collects negated terms next to positive ones; `ParsedSimpleQuery`
  gains `negatedSearchTerms`.
- The demo provider already had `$nor`; its `$text` matcher learned `-word` and
  `-"phrase"`.
