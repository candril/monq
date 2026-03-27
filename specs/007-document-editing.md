# Document Editing

**Status**: Draft

## Description

Edit MongoDB documents inline or via `$EDITOR`. Supports updating individual fields or the full document. All mutations require confirmation.

## Out of Scope

- Bulk updates
- Insert new documents (future spec)
- Delete documents (future spec)
- Schema validation

## Capabilities

### P1 - Must Have

- Open selected document in `$EDITOR` as JSON
- Parse edited JSON and apply update
- Confirmation prompt before applying changes
- Show diff of changes before confirming

### P2 - Should Have

- Inline field editing (press `e` on a field in preview to edit value)
- Undo last edit (revert to previous document state)

### P3 - Nice to Have

- Edit history per document
- Dry-run mode (show what would change without applying)

## Technical Notes

### Edit Flow

1. User presses `e` on selected document
2. Document exported as formatted JSON to temp file
3. `$EDITOR` opens the temp file
4. On save+close, parse the edited JSON
5. Compute diff between original and edited
6. Show diff and ask for confirmation
7. Apply `replaceOne` with the updated document

```typescript
import { $ } from "bun"

async function editDocument(doc: Document): Promise<Document | null> {
  const tmpFile = `/tmp/monq-${doc._id}.json`
  await Bun.write(tmpFile, JSON.stringify(doc, null, 2))
  
  const editor = process.env.EDITOR || "vim"
  await $`${editor} ${tmpFile}`
  
  const edited = JSON.parse(await Bun.file(tmpFile).text())
  await unlink(tmpFile)
  
  return edited
}
```

## File Structure

### Create
- `src/components/EditConfirmation.tsx` - Diff and confirmation dialog

### Modify
- `src/providers/mongodb.ts` - Add update operations
- `src/state.ts` - Add edit state
