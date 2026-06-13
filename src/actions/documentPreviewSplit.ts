/** External document editor in a tmux split that follows the row cursor. */

import { watch, type FSWatcher } from "fs"
import { mkdir } from "fs/promises"
import { spawn, spawnSync } from "child_process"
import { join } from "path"
import { tmpdir } from "os"
import { EJSON } from "bson"
import JSON5 from "json5"
import type { Document } from "mongodb"
import type { Dispatch } from "react"
import type { AppAction } from "../state"
import { copyToClipboard } from "../utils/clipboard"
import { serializeDocumentRelaxed } from "../utils/document"
import { stripComments, stripErrorComment } from "../utils/editor"
import { fetchDocuments, replaceDocument } from "../providers/mongodb"

type PreviewOpenResult = "tmux" | "clipboard" | "none"

interface PreviewContext {
  dbName: string
  collectionName: string
}

interface PreviewSession {
  paneId: string
  filePath: string
}

interface PreviewFile {
  collectionName: string
  originalDoc: Document
  dispatch: Dispatch<AppAction>
}

let session: PreviewSession | null = null
let previewFile: PreviewFile | null = null
let watcher: FSWatcher | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let suppressNextWatchEvent = false

export async function openDocumentPreviewSplit(
  document: Document,
  context: PreviewContext,
  dispatch: Dispatch<AppAction>,
): Promise<PreviewOpenResult> {
  const filePath = previewFilePath(context)
  await writePreviewFile(filePath, document, { collectionName: context.collectionName, dispatch })
  startWatching(filePath)

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
  if (!session || !previewFile || !document) {
    return
  }

  await writePreviewFile(session.filePath, document, {
    collectionName: previewFile.collectionName,
    dispatch: previewFile.dispatch,
  })
  reloadPane(session)
}

function previewDir(): string {
  return join(tmpdir(), "monq", "document-preview")
}

function previewFilePath({ dbName, collectionName }: PreviewContext): string {
  return join(
    previewDir(),
    `monq-editor-${safePathPart(dbName)}-${safePathPart(collectionName)}.jsonc`,
  )
}

function safePathPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_") || "unknown"
}

function docIdKey(document: Document): string {
  const id = document._id as { toHexString?: () => string } | undefined
  return typeof id?.toHexString === "function" ? id.toHexString() : String(document._id)
}

async function writePreviewFile(
  filePath: string,
  document: Document,
  file: Omit<PreviewFile, "originalDoc">,
): Promise<void> {
  await mkdir(previewDir(), { recursive: true })
  previewFile = { ...file, originalDoc: document }
  suppressNextWatchEvent = true
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
  const liveEditArgs = /^(?:n?vim|view)$/.test(editorName)
    ? ["+setlocal autoread", "+normal! gg"]
    : []

  return [...editorArgs, ...liveEditArgs, filePath]
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

function startWatching(filePath: string): void {
  if (watcher) {
    watcher.close()
  }

  watcher = null
  try {
    watcher = watch(filePath, () => {
      if (suppressNextWatchEvent) {
        suppressNextWatchEvent = false
        return
      }
      if (debounceTimer) {
        clearTimeout(debounceTimer)
      }
      debounceTimer = setTimeout(() => applySavedPreviewFile(filePath), 150)
    })
    watcher.on("error", () => {
      watcher?.close()
      watcher = null
    })
  } catch {
    watcher = null
  }
}

async function applySavedPreviewFile(filePath: string): Promise<void> {
  if (!previewFile) {
    return
  }

  let edited: Document
  try {
    edited = parseDocument(await Bun.file(filePath).text())
  } catch (err) {
    previewFile.dispatch({
      type: "SHOW_MESSAGE",
      message: `Document edit parse error: ${(err as Error).message}`,
      kind: "warning",
    })
    return
  }

  if (docIdKey(edited) !== docIdKey(previewFile.originalDoc)) {
    previewFile.dispatch({
      type: "SHOW_MESSAGE",
      message: "Document _id cannot be changed",
      kind: "error",
    })
    return
  }

  const { _id: _oldId, ...oldFields } = previewFile.originalDoc
  const { _id: _newId, ...newFields } = edited
  if (
    EJSON.stringify(oldFields, undefined, 0, { relaxed: true }) ===
    EJSON.stringify(newFields, undefined, 0, { relaxed: true })
  ) {
    await refreshPreviewFileFromDatabase(filePath)
    return
  }

  try {
    await replaceDocument(previewFile.collectionName, previewFile.originalDoc._id, newFields)
    previewFile = { ...previewFile, originalDoc: edited }
    previewFile.dispatch({
      type: "SHOW_MESSAGE",
      message: "Updated document from tmux split",
      kind: "success",
    })
    previewFile.dispatch({ type: "FREEZE_SELECTION" })
    previewFile.dispatch({ type: "RELOAD_DOCUMENTS" })
  } catch (err) {
    previewFile.dispatch({
      type: "SHOW_MESSAGE",
      message: `Document update failed: ${(err as Error).message}`,
      kind: "error",
    })
  }
}

async function refreshPreviewFileFromDatabase(filePath: string): Promise<void> {
  if (!previewFile) {
    return
  }

  try {
    const { documents } = await fetchDocuments(
      previewFile.collectionName,
      { _id: previewFile.originalDoc._id },
      { limit: 1 },
    )
    const fresh = documents[0]
    if (!fresh) {
      previewFile.dispatch({
        type: "SHOW_MESSAGE",
        message: "Document no longer exists in MongoDB",
        kind: "error",
      })
      return
    }
    await writePreviewFile(filePath, fresh, {
      collectionName: previewFile.collectionName,
      dispatch: previewFile.dispatch,
    })
    reloadPaneIfClean()
  } catch (err) {
    previewFile.dispatch({
      type: "SHOW_MESSAGE",
      message: `Document refresh failed: ${(err as Error).message}`,
      kind: "error",
    })
  }
}

function reloadPaneIfClean(): void {
  if (!session) {
    return
  }
  reloadPane(session)
}

function parseDocument(content: string): Document {
  const raw = JSON5.parse(stripComments(stripErrorComment(content)))
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Expected a single JSON document object")
  }
  return EJSON.deserialize(raw as Parameters<typeof EJSON.deserialize>[0]) as Document
}
