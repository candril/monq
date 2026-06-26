# 063 — Optimistic Concurrency on Document Edits

**Status**: In Progress

## Description

Editing a document must not silently overwrite changes made to it elsewhere since the
user opened it. Today both edit flows issue a full-document `replaceOne({ _id }, doc)`
with no concurrency check, so they are **last-writer-wins**: a concurrent/remote change
to any field — even one the user never touched — is lost.

This spec adds an **abort-on-conflict** guard: before writing, re-read the stored
document and compare it (by value) against the snapshot the user opened. If it changed,
refuse the write and tell the user to reload and re-apply, rather than clobbering.

### Background

`replaceDocument` (`src/providers/mongodb.ts`) calls `collection.replaceOne({ _id }, newDoc)`.
The save flows previously treated either the on-screen snapshot or a fresh re-read as
"the original" inconsistently (see [[062-bson-type-preservation]]), which both failed to
detect remote changes and, in the bulk case, could mark an untouched-but-remotely-changed
doc as "changed" and overwrite it with stale on-screen values.

### Lost-update example

```
DB at open:   { _id, a: 1, b: 1 }      user opens, edits b → 2
concurrently: { _id, a: 9, b: 1 }      another client sets a = 9
user saves:   replaceOne({_id}, { a: 1, b: 2 })   → a:9 silently LOST
```

## Out of Scope

- **Same-field merge / automatic 3-way merge.** On conflict we abort and reload; we do
  not attempt to merge the user's edits with the remote change. (A future field-level
  `$set` merge could let disjoint edits coexist.)
- **Preserving the user's unsaved edit text on conflict.** The buffer is reloaded from
  the DB; the user re-applies. (A future enhancement could stash their version to a
  `.rej` file.)
- **The confirm→apply TOCTOU window in bulk edit.** The re-read happens when the diff is
  computed (closing the load→save gap); a change in the brief window between the confirm
  dialog and `applyEdits` is not re-checked.
- **Deletes and inserts.** Conflict detection covers replacements (the lost-update case).
  Removing a doc in the editor (delete) and adding new docs (insert) are unchanged.

## Capabilities

### P1 — Abort-on-conflict for single-doc edit

`src/actions/documentPreviewSplit.ts`: on save, re-read the stored doc with true BSON
types. If the re-read fails → don't write (tell the user to retry). If the doc is gone →
report and reload. If it changed *by value* vs the on-screen snapshot → warn, reload the
buffer, and don't write. Otherwise reconcile types against the fresh doc and replace.

### P2 — Abort-on-conflict for bulk edit

`src/actions/editMany.ts`: diff the edited array against the **on-screen snapshot** to
find what the user changed (fixes the [[062-bson-type-preservation]] regression where
untouched docs could be overwritten), then resolve those into safe writes via
`resolveWrites`: re-read each by `_id`; skip + report any that were deleted or changed
remotely; reconcile the rest. Conflicts surface in the result (reported count excludes
them).

### P3 — Tests & docs

- `src/utils/docCompare.test.ts` — value vs canonical equality.
- `resolveWritesPure` unit tests — unchanged/changed/deleted/multi-doc conflict mixes.
- Document the conflict behavior in the editing docs.

## Technical Notes

### Comparison helper — `src/utils/docCompare.ts`

`stableEjson(value, { relaxed })` serializes with deeply-sorted keys so field order never
reads as a change.

- `sameByValue(a, b)` — relaxed EJSON: equal values regardless of numeric BSON type. Used
  for **conflict detection** (a remote `Long(5)`→`Int32(5)` of the same value is not a
  conflict).
- `sameCanonical(a, b)` — canonical EJSON: exact equality including numeric type. Used for
  the single-doc "did the user actually change anything" check.

### Single-doc save (`documentPreviewSplit.ts`)

```
fresh = fetchRawDocuments({ _id }, { limit: 1 })[0]
if (fetch failed)            → "could not re-read — not saved" (keep buffer, retry)
if (!fresh)                  → "no longer exists" + reload
if (!sameByValue(fresh, snapshot)) → "changed in MongoDB — reloaded, not saved" + reload
newDoc = reconcileTypes(edited, fresh)
if (sameCanonical(fresh, newDoc)) → no-op + reload
replaceOne({ _id }, newDoc)
```

The on-screen snapshot is `previewFile.originalDoc`. It is promoted (plain numbers), but
`sameByValue` uses relaxed EJSON so it compares cleanly against the raw fresh doc.

### Bulk save (`editMany.ts`)

`resolveWritesPure(toReplace, originalDocs, freshDocs)` is pure and unit-tested; the async
`resolveWrites` wraps it with the `_id: { $in }` re-read and the "re-read failed → refuse
all" path. `result.updated` is set to the number of safe writes; conflicts go to
`result.errors`.

### Why two originals collapse into one base

The snapshot tells us what the user *saw*; the fresh re-read tells us the *current* state
and carries true types. Conflict = "fresh differs from snapshot by value". When there is
no conflict, fresh and snapshot have equal values, so reconciling the user's edits against
the fresh doc yields correct values *and* types with a single, consistent base.
