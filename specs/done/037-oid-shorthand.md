# ObjectId Shorthand in Simple Query Bar

**Status**: Done

## Description

The simple query bar accepts `oid(...)` as a shorthand for `ObjectId(...)` when
specifying MongoDB ObjectId values. Both forms are parsed identically and
produce a native `ObjectId` in the BSON filter.

## Out of Scope

- `oid()` support in the pipeline/BSON editor (that is raw JS-like syntax, not the simple parser)
- Short forms for other BSON types (UUID, BinData, etc.)

---

## Capabilities

### P1 — Must Have

- **`oid(<hex>)` shorthand** — in the simple query bar, `field:oid(507f1f77bcf86cd799439011)` is parsed as `{ field: ObjectId("507f1f77bcf86cd799439011") }`.
- **`ObjectId(<hex>)` long form** — the full `ObjectId(...)` syntax is also accepted and behaves identically.
- **Quoted and unquoted hex** — both `oid("507f...")` and `oid(507f...)` are valid.
- **Round-trip serialisation** — when a filter containing an ObjectId is serialised back to simple-query text (e.g. after `filterToSimple()`), it is written as `ObjectId(...)`, not `oid(...)`.

---

## Technical Notes

Implemented in `src/query/parser.ts` via `coerceValue()`:

```typescript
// ObjectId — accepts both ObjectId(...) and oid(...) shorthand
const oidMatch = value.match(/^(?:ObjectId|oid)\(["']?([0-9a-fA-F]{24})["']?\)$/)
if (oidMatch) return new ObjectId(oidMatch[1])
```

Round-trip back to simple text (in `filterToSimple()`):
```typescript
} else if (val instanceof ObjectId) {
  tokens.push(`${key}:ObjectId(${val.toHexString()})`)
```

### Examples

| Simple query input | BSON filter |
|---|---|
| `_id:oid(507f1f77bcf86cd799439011)` | `{ _id: ObjectId("507f1f77bcf86cd799439011") }` |
| `_id:ObjectId(507f1f77bcf86cd799439011)` | `{ _id: ObjectId("507f1f77bcf86cd799439011") }` |
| `_id:oid("507f1f77bcf86cd799439011")` | `{ _id: ObjectId("507f1f77bcf86cd799439011") }` |

---

## File Structure

No new files. Implemented entirely within:
```
src/query/parser.ts    # coerceValue() regex + filterToSimple() serialisation
```
