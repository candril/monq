/** External document preview in a tmux split that follows the row cursor. */

import { spawn, spawnSync } from "child_process"
import { join } from "path"
import { tmpdir } from "os"
import type { Document } from "mongodb"
import { copyToClipboard } from "../utils/clipboard"
import { serializeDocumentRelaxed } from "../utils/document"

type PreviewOpenResult = "tmux" | "clipboard" | "none"

interface PreviewContext {
  dbName: string
  collectionName: string
}

interface PreviewSession {
  paneId: string
  filePath: string
}

let session: PreviewSession | null = null

export async function openDocumentPreviewSplit(
  document: Document,
  context: PreviewContext,
): Promise<PreviewOpenResult> {
  const filePath = previewFilePath(context)
  await writePreviewFile(filePath, document)

  if (!process.env.TMUX) {
    await copyToClipboard(filePath).catch(() => {})
    return "clipboard"
  }

  const paneId = openDetachedTmuxPane(filePath)
  if (!paneId) {
    return "none"
  }

  session = { paneId, filePath }
  return "tmux"
}

export async function updateDocumentPreviewSplit(document: Document | null): Promise<void> {
  if (!session || !document) {
    return
  }

  await writePreviewFile(session.filePath, document)
  reloadPane(session)
}

function previewFilePath({ dbName, collectionName }: PreviewContext): string {
  return join(tmpdir(), `monq-preview-${safePathPart(dbName)}-${safePathPart(collectionName)}.json`)
}

function safePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_") || "unknown"
}

async function writePreviewFile(filePath: string, document: Document): Promise<void> {
  await Bun.write(filePath, `${serializeDocumentRelaxed(document)}\n`)
}

function openDetachedTmuxPane(filePath: string): string | null {
  const splitFlag = process.env.MONQ_TMUX_SPLIT === "h" ? "-v" : "-h"
  const pct = "50"
  const editorArgs = buildEditorArgs(filePath)
  const result = spawnSync(
    "tmux",
    ["split-window", "-d", splitFlag, "-p", pct, "-P", "-F", "#{pane_id}", ...editorArgs],
    { encoding: "utf8" },
  )

  if (result.status !== 0) {
    return null
  }

  return result.stdout.trim() || null
}

function buildEditorArgs(filePath: string): string[] {
  const editor = process.env.EDITOR || process.env.VISUAL || "vi"
  const editorArgs = editor.split(/\s+/).filter(Boolean)
  const editorName = editorArgs[0]?.split("/").at(-1) ?? ""
  const readonlyArgs = /^(?:n?vim|view)$/.test(editorName)
    ? ["-R", "+setlocal autoread readonly nomodifiable", "+normal! gg"]
    : []

  return [...editorArgs, ...readonlyArgs, filePath]
}

function reloadPane({ paneId }: PreviewSession): void {
  const result = spawnSync("tmux", ["display-message", "-p", "-t", paneId, "#{pane_id}"], {
    stdio: "ignore",
  })
  if (result.status !== 0) {
    session = null
    return
  }

  spawn("tmux", ["send-keys", "-t", paneId, "Escape", ":checktime", "Enter", "gg"], {
    detached: true,
    stdio: "ignore",
  }).unref()
}
