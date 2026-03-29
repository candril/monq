# Connection Error Handling

**Status**: Draft

## Description
Improve error feedback when the connection string is invalid or the connection fails. Currently errors may be silent or confusing.

## Out of Scope
- Retry logic
- Connection string editing at runtime

## Capabilities

### P1 - Must Have
- Invalid URI format → clear error message shown immediately on startup before attempting connection
- Connection timeout / refused → error screen with the specific message (not a generic "failed")
- DB specified in URI not found → toast or error screen stating the DB was not found, fall back to DB picker

### P2 - Should Have
- Error message includes the URI host so the user can verify they connected to the right place
- Distinguish between "could not reach server" and "server reachable but auth failed"
