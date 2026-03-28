# Field Suggestions

**Status**: Done

## Description

A popup above the filter bar that shows schema-aware field name suggestions as the user types in simple query mode. Supports dot-notation drill-down and negation prefix. Accepting a suggestion appends it to the current query input.

## Out of Scope

- Value suggestions (only field names are suggested, not values)
- Suggestions in BSON mode textareas
- Suggestions outside the filter bar

## Capabilities

### P1 - Must Have

- Show popup above the filter bar when the user is typing a field token
- Suggestions derived from `schemaMap` (sampled from current documents)
- Fuzzy-filtered by the current partial token
- Dot-notation drill-down: typing `address.` shows `address.city`, `address.zip`, etc.
- `Ctrl+Y` accepts the highlighted suggestion (appends to query input)
- `Ctrl+N` / `Ctrl+P` navigate suggestions
- Popup disappears when the filter bar is closed or query is cleared
- Negation prefix aware: `-Field` suggests `Field` names with the `-` preserved

### P2 - Should Have

- Auto-hide if no matching suggestions
- Scroll support for many suggestions

## Implementation Notes

### Popup Position

`FilterSuggestions` renders directly above the `FilterBar` (inside the same vertical layout box). It uses a fixed height scrollbox showing up to ~8 suggestions.

### Token Detection

`getLastToken(input)` from `src/query/parser.ts` splits at the last whitespace boundary to find the current partial token. The negation prefix `-` is stripped before field lookup and re-prepended on accept.

### Schema Integration

`getSubfieldSuggestions(schemaMap, prefix)` from `src/query/schema.ts` returns all field paths starting with `prefix`, supporting dot-notation expansion.

### Accept Behavior

`Ctrl+Y` replaces the last token in `queryInput` with the full suggestion, then moves focus back to the input so typing can continue immediately.

## Key Files

- `src/components/FilterSuggestions.tsx` — Suggestion popup component
- `src/query/parser.ts` — `getLastToken()` for token boundary detection
- `src/query/schema.ts` — `getSubfieldSuggestions()` for field path lookup
- `src/hooks/useKeyboardNav.ts` — `Ctrl+Y`, `Ctrl+N`, `Ctrl+P` in suggestion context
- `src/state.ts` — suggestion state: `suggestions`, `suggestionIndex`

## Keyboard (in filter bar with suggestions visible)

| Key | Action |
|-----|--------|
| `Ctrl+Y` | Accept highlighted suggestion |
| `Ctrl+N` | Next suggestion |
| `Ctrl+P` | Previous suggestion |
