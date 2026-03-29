/**
 * Edit a document in $EDITOR.
 * Uses the original _id in the temp filename to look up the document for update.
 * File is written as .jsonc so editors activate JSON with comments support.
 */

import { tmpdir } from "os"
import { join } from "path"
import { mkdir, unlink } from "fs/promises"
import type { Document } from "mongodb"
import JSON5 from "json5"
import type { SchemaMap } from "../query/schema"
import { replaceDocument } from "../providers/mongodb"
import { serializeDocument, deserializeDocument } from "../utils/document"
import { getEditor, ERROR_COMMENT_RE } from "../utils/editor"

function buildHeader(
  collectionName: string,
  dbName: string,
  doc: Document,
  schemaMap?: SchemaMap,
): string {
  const idStr = String(doc._id)

  const fieldLines =
    schemaMap && schemaMap.size > 0
      ? [...schemaMap.entries()]
          .filter(([p]) => !p.includes("."))
          .map(([p, info]) => `//   ${p}: ${info.type}`)
      : [`//   (no schema sampled)`]

  return [
    `// Mon-Q — editing document in ${collectionName} @ ${dbName}`,
    `// _id: ${idStr} (read-only — changes to _id are ignored)`,
    `// Save to apply (:wq). Quit without saving (:q!) to cancel.`,
    `//`,
    `// Schema (${collectionName}):`,
    ...fieldLines,
    ``,
  ].join("\n")
}

function injectErrorComment(content: string, errorMsg: string): string {
  const stripped = content.replace(ERROR_COMMENT_RE, "")
  return (
    `// !! PARSE ERROR: ${errorMsg}\n// Fix the JSON below and save, or delete all content to cancel.\n\n` +
    stripped
  )
}

/** Open a document in $EDITOR, save updates to DB on close. */
export async function editDocument(
  collectionName: string,
  dbName: string,
  doc: Document,
  schemaMap?: SchemaMap,
): Promise<{ updated: boolean; error?: string }> {
  const originalId = doc._id
  const idStr = String(originalId)
  const dir = join(tmpdir(), "monq", collectionName)
  await mkdir(dir, { recursive: true })
  const tmpFile = join(dir, `${idStr}.jsonc`)

  const ejson = serializeDocument(doc)
  const header = buildHeader(collectionName, dbName, doc, schemaMap)
  const initialContent = header + ejson

  await Bun.write(tmpFile, initialContent)

  const editor = getEditor()

  // Editor retry loop: re-open with inline error comment on parse failure
  while (true) {
    const proc = Bun.spawn([editor, tmpFile], {
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    })
    await proc.exited

    if (proc.exitCode !== 0) {
      await unlink(tmpFile).catch(() => {})
      return { updated: false }
    }

    let editedContent: string
    try {
      editedContent = await Bun.file(tmpFile).text()
    } catch {
      await unlink(tmpFile).catch(() => {})
      return { updated: false, error: "Could not read edited file" }
    }

    // Strip header + error comments to get the bare JSON
    const stripped = editedContent
      .replace(ERROR_COMMENT_RE, "")
      .replace(/^\/\/.*\n/gm, "")
      .trim()

    // Empty → cancelled
    if (stripped === "") {
      await unlink(tmpFile).catch(() => {})
      return { updated: false }
    }

    // Unchanged → no-op
    if (stripped === ejson.trim()) {
      await unlink(tmpFile).catch(() => {})
      return { updated: false }
    }

    try {
      const editedDoc = deserializeDocument(stripped)
      // Parse succeeded — proceed
      await unlink(tmpFile).catch(() => {})
      const { _id: _, ...docWithoutId } = editedDoc

      try {
        await replaceDocument(collectionName, originalId, docWithoutId)
        return { updated: true }
      } catch (err) {
        return { updated: false, error: `Update failed: ${(err as Error).message}` }
      }
    } catch (err) {
      // Inject error comment and loop back to re-open editor
      await Bun.write(tmpFile, injectErrorComment(editedContent, (err as Error).message))
    }
  }
}
