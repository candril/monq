# Welcome Screen — DB and Collection Picker

**Status**: Draft

## Description
On startup, when no DB or collection is pre-selected, show a welcome screen that guides the user through picking a DB then a collection using the existing Ctrl+P palette approach. Should feel intentional, not like a fallback state.

## Out of Scope
- Custom UI components (keep Ctrl+P palette)
- Saved connections / history (separate spec)

## Capabilities

### P1 - Must Have
- Welcome screen shown when no DB is selected (instead of dropping straight into an empty state)
- Step 1: Ctrl+P opens DB picker automatically
- Step 2: After DB selected, Ctrl+P opens collection picker automatically
- Backspace on the collection picker returns to the DB picker (see spec-030)
- Clear visual indication of which step the user is on (e.g. header shows "Select a database" / "Select a collection")

### P2 - Should Have
- If URI includes a DB name, skip step 1 and go straight to collection picker
- Welcome screen feels distinct from the normal document view (different header copy, no empty list)

## Technical Notes
Reuse existing `CommandPalette` component. The "welcome" state is just a different palette mode with different copy and auto-open behaviour.
