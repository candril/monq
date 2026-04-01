/**
 * Open full explain output in $EDITOR as read-only JSON.
 */

import { tmpdir } from "os"
import { join } from "path"
import { mkdir } from "fs/promises"
import type { Document } from "mongodb"
import { getEditor } from "../utils/editor"

export async function openExplainInEditor(collectionName: string, result: Document): Promise<void> {
  const dir = join(tmpdir(), "monq", collectionName)
  await mkdir(dir, { recursive: true })
  const tmpFile = join(dir, `explain-${Date.now()}.json`)

  await Bun.write(tmpFile, JSON.stringify(result, null, 2))

  const editor = getEditor()
  const proc = Bun.spawn([editor, tmpFile], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  })
  await proc.exited
}
