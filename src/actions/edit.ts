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

const ERROR_COMMENT_RE = /^(\/\/ ERROR:.*\n(\/\/.*\n)*)/m

function injectErrorComment(content: string, errorMsg: string): string {
  const stripped = content.replace(ERROR_COMMENT_RE, "")
  return `// ERROR: ${errorMsg}\n// Fix the JSON below and save, or delete all content to cancel.\n` + stripped
}

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

  const editor = process.env.EDITOR || process.env.VISUAL || "vi"

  // Editor retry loop: re-open with inline error comment on parse failure
  let editedContent: string
  while (true) {
    const proc = Bun.spawn([editor, tmpFile], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
    await proc.exited

    try {
      editedContent = await Bun.file(tmpFile).text()
    } catch {
      await unlink(tmpFile).catch(() => {})
      return { updated: false, error: "Could not read edited file" }
    }

    // Empty or unchanged (possibly with error comment stripped) → cancelled / no-op
    const stripped = editedContent.replace(ERROR_COMMENT_RE, "")
    if (stripped.trim() === "" || stripped.trim() === ejson.trim()) {
      await unlink(tmpFile).catch(() => {})
      return { updated: false }
    }

    try {
      // Attempt parse — if it succeeds, break out of retry loop
      deserializeDocument(stripped)
      editedContent = stripped
      break
    } catch (err) {
      // Inject error comment and loop back to re-open editor
      await Bun.write(tmpFile, injectErrorComment(editedContent, (err as Error).message))
    }
  }

  // Clean up temp file
  await unlink(tmpFile).catch(() => {})

  // Parse the final clean content (error comment already stripped above)
  const editedDoc = deserializeDocument(editedContent)

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
