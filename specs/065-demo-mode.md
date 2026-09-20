# Demo Mode

**Status**: Done

## Description

`monq --demo` opens a fictional shop's data from memory: two databases, five
collections, a few hundred documents. No MongoDB server, no connection string,
nothing written to disk. Browsing, filtering, sorting, aggregating, editing and
deleting all work — against a store that is rebuilt on every launch.

monq is the last of the five tools with no offline mode. Without one there is
no way to try it without a server, no way to record the documentation, and no
way for the fleet's smoke harness to prove monq still paints a frame after a
dependency bump.

## Out of Scope

- Being MongoDB. The demo implements the query and aggregation surface `monq`
  itself uses, not the server's. An operator it does not know matches nothing
  rather than pretending.
- Persistence. Edits live for the session; the next launch is the seed again.
- Replacing the connection screen. `--demo` is a URI like any other; the picker,
  profiles and `--uri` are untouched.

## Capabilities

### P1 - Must Have

- `monq --demo` lands directly in the shop database with its collections loaded,
  from any working directory and with no config file.
- The document table, the JSON preview, filters, sorts and paging work over the
  seeded data.
- Writes — insert, edit, delete, `updateMany`, `deleteMany` — apply to the
  in-memory store and are visible immediately, as they would be against a server.
- Indexes list, and can be created and dropped.
- Aggregation pipelines run: `$match`, `$sort`, `$skip`, `$limit`, `$count`,
  `$group` and `$project`. A stage the demo does not implement passes documents
  through untouched instead of throwing.
- No network call is made, and `disconnect()` leaves nothing behind.

### P2 - Should Have

- The seed is deterministic: the same documents, in the same order, every launch,
  so a screenshot taken today matches one taken next month.
- The data has enough shape to be worth looking at — nested objects, arrays,
  dates, ObjectIds, missing fields, mixed numeric types.

## Technical Notes

The seam is `getDb()` in `providers/mongodb.ts`: every exported function already
reaches the server through it, so the demo is a stand-in `Db` whose collections
implement the driver methods those functions call — `find`, `countDocuments`,
`estimatedDocumentCount`, `aggregate`, `insertOne`, `deleteOne`, `deleteMany`,
`updateMany`, `replaceOne`, `listIndexes`, `createIndex`, `dropIndex`, `rename`,
`drop`. Nothing else in the provider changes shape.

`init()` recognises the demo URI and builds the store instead of a `MongoClient`;
`listDatabases`, `createDatabase` and `dropDatabase` reach the client directly and
each get a demo branch. Cursors are lazy in the same way the driver's are —
`sort`/`skip`/`limit`/`project` return `this`, and the work happens in `toArray`
or when iterated, so streaming export keeps working.

## File Structure

- `src/providers/demo.ts` — the store, the query engine, the seeded data
- `src/providers/mongodb.ts` — `init`, `getDb`, `listDatabases`, `createDatabase`,
  `dropDatabase`, `disconnect`
- `src/index.tsx` — the `--demo` flag
