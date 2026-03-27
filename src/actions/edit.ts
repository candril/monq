/**
 * Edit a document in $EDITOR.
 * Uses the original _id in the temp filename to look up the document for update.
 */

import { tmpdir } from "os"
import { join } from "path"
import { unlink } from "fs/promises"
import type { Document } from "mongodb"
import {
  serializeDocument,
  deserializeDocument,
  replaceDocument,
} from "../providers/mongodb"

/** Open a document in $EDITOR, save updates to DB on close. */
export async function editDocument(
  collectionName: string,
  doc: Document,
): Promise<{ updated: boolean; error?: string }> {
  const originalId = doc._id
  const idStr = String(originalId)
  const tmpFile = join(tmpdir(), `monq-${collectionName}-${idStr}.json`)

  // Write EJSON to temp file
  const ejson = serializeDocument(doc)
  await Bun.write(tmpFile, ejson)

  // Open in $EDITOR
  const editor = process.env.EDITOR || process.env.VISUAL || "vi"
  const proc = Bun.spawn([editor, tmpFile], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  await proc.exited

  // Read back edited content
  let editedContent: string
  try {
    editedContent = await Bun.file(tmpFile).text()
  } catch {
    return { updated: false, error: "Could not read edited file" }
  }

  // Clean up temp file
  await unlink(tmpFile).catch(() => {})

  // Check if content changed
  if (editedContent.trim() === ejson.trim()) {
    return { updated: false }
  }

  // Parse edited EJSON
  let editedDoc: Document
  try {
    editedDoc = deserializeDocument(editedContent)
  } catch (err) {
    return { updated: false, error: `Invalid JSON: ${(err as Error).message}` }
  }

  // Remove _id from the replacement doc (MongoDB doesn't allow changing _id via replaceOne)
  // But we use the original _id to find the document
  const { _id: _, ...docWithoutId } = editedDoc

  // Save to DB using original _id
  try {
    await replaceDocument(collectionName, originalId, docWithoutId)
    return { updated: true }
  } catch (err) {
    return { updated: false, error: `Update failed: ${(err as Error).message}` }
  }
}
