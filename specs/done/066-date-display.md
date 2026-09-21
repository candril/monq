# Date Display

**Status**: Done

## Description

Date cells in the document list show the full UTC timestamp instead of only the
UTC day, and the `_id` column can be switched to show when each ObjectId was
created.

The day alone hides the time and, being UTC, lands documents written late in
the evening on the following day for anyone east of Greenwich. Seeing when a
document was created is the most common reason to decode an ObjectId by hand.

## Out of Scope

- Local time zones. Everything is UTC, matching how the query bar parses dates
  (spec 036).
- The preview pane. It keeps showing relaxed EJSON, identical to the editor.
- Inferring dates from strings or epoch numbers.
- Decoding ObjectIds in columns other than `_id`.

## Capabilities

### P1 - Must Have

- Date cells render as `YYYY-MM-DD HH:MM:SSZ` in UTC.
- BSON `Timestamp` cells render the same way (from their seconds part) instead
  of crashing the row render.
- `Shift+T` (`doc.toggle_id_date`, also in the command palette) toggles the
  `_id` column between the ObjectId hex and its creation time.
- Turning the toggle on when no loaded document has an ObjectId `_id` shows a
  warning toast and changes nothing.
- The toggle is display-only: yank, filter-from-value, marks and edits keep
  using the ObjectId.

## Technical Notes

- `formatValue` takes an `objectIdAsDate` option; `DocumentList` passes it only
  for the `_id` column, both when measuring widths and when rendering cells.
- `idAsDate` is global UI state (not per tab), like `filterBarVisible`.
- In a collection with mixed `_id` types, only ObjectId values render as dates.
