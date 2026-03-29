# Backspace Returns to DB Picker from Collection Picker

**Status**: In Progress — implemented as part of spec 029 (WelcomeScreen)

## Description
When the user is on the collection picker (step 2 of startup flow), pressing Backspace should return them to the DB picker so they can change their mind without restarting.

## Out of Scope
- Backspace navigation deeper in the app (this is startup flow only)
- Undo of DB selection after a collection is already open

## Capabilities

### P1 - Must Have
- Backspace in the collection picker closes it and re-opens the DB picker
- The previously selected DB is shown in the header so the user knows what they're changing

### P2 - Should Have
- DB picker re-opens with the previously selected DB highlighted
