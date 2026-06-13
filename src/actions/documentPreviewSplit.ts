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
import { replaceDocument } from "../providers/mongodb"

type PreviewOpenResult = "tmux" | "clipboard" | "none"

interface PreviewContext {
  dbName: string
  collectionName: string
}

interface PreviewSession {
  paneId: string
  filePath: string
  dbName: string
  collectionName: string
}

interface PreviewFile {
  dbName: string
  collectionName: string
  originalDoc: Document
  dispatch: Dispatch<AppAction>
}

type PreviewFileContext = Omit<PreviewFile, "originalDoc">

let session: PreviewSession | null = null
let watcher: FSWatcher | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null
const previewFiles = new Map<string, PreviewFile>()

export async function openDocumentPreviewSplit(
  document: Document,
  context: PreviewContext,
  dispatch: Dispatch<AppAction>,
): Promise<PreviewOpenResult> {
  const filePath = previewFilePath(context, document)
  await writePreviewFile(filePath, document, {
    dbName: context.dbName,
    collectionName: context.collectionName,
    dispatch,
  })
  startWatchingPreviewDir()

  if (!process.env.TMUX) {
    await copyToClipboard(filePath).catch(() => {})
    return "clipboard"
  }

  const paneId = openDetachedTmuxPane(filePath)
  if (!paneId) {
    return "none"
  }

  session = { paneId, filePath, dbName: context.dbName, collectionName: context.collectionName }
  return "tmux"
}

export async function updateDocumentPreviewSplit(document: Document | null): Promise<void> {
  if (!session || !document) {
    return
  }

  const file = previewFiles.get(session.filePath)
  if (!file) {
    return
  }

  const filePath = previewFilePath(
    { dbName: file.dbName, collectionName: file.collectionName },
    document,
  )
  await writePreviewFile(filePath, document, {
    dbName: file.dbName,
    collectionName: file.collectionName,
    dispatch: file.dispatch,
  })
  session = { ...session, filePath, dbName: file.dbName, collectionName: file.collectionName }
  loadPaneFile(session)
}

function previewDir(): string {
  return join(tmpdir(), "monq", "document-preview")
}

function previewFilePath({ dbName, collectionName }: PreviewContext, document: Document): string {
  return join(
    previewDir(),
    `monq-edit-${safePathPart(dbName)}-${safePathPart(collectionName)}-${safePathPart(docIdKey(document))}.jsonc`,
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
  file: PreviewFileContext,
): Promise<void> {
  await mkdir(previewDir(), { recursive: true })
  previewFiles.set(filePath, { ...file, originalDoc: document })
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

function loadPaneFile({ paneId, filePath }: PreviewSession): void {
  const result = spawnSync("tmux", ["display-message", "-p", "-t", paneId, "#{pane_id}"], {
    stdio: "ignore",
  })
  if (result.status !== 0) {
    session = null
    return
  }

  spawn(
    "tmux",
    [
      "send-keys",
      "-t",
      paneId,
      "Escape",
      `:execute 'edit ' . fnameescape('${vimString(filePath)}')`,
      "Enter",
      "gg",
    ],
    { detached: true, stdio: "ignore" },
  ).unref()
}

function startWatchingPreviewDir(): void {
  if (watcher) {
    return
  }

  try {
    watcher = watch(previewDir(), (_event, name) => {
      const filename = name?.toString()
      if (!filename) {
        return
      }
      const filePath = join(previewDir(), filename)
      if (!previewFiles.has(filePath)) {
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
  const file = previewFiles.get(filePath)
  if (!file) {
    return
  }

  let edited: Document
  try {
    edited = parseDocument(await Bun.file(filePath).text())
  } catch (err) {
    file.dispatch({
      type: "SHOW_MESSAGE",
      message: `Document edit parse error: ${(err as Error).message}`,
      kind: "warning",
    })
    return
  }

  if (docIdKey(edited) !== docIdKey(file.originalDoc)) {
    file.dispatch({
      type: "SHOW_MESSAGE",
      message: "Document _id cannot be changed",
      kind: "error",
    })
    return
  }

  const { _id: _oldId, ...oldFields } = file.originalDoc
  const { _id: _newId, ...newFields } = edited
  if (
    EJSON.stringify(oldFields, undefined, 0, { relaxed: true }) ===
    EJSON.stringify(newFields, undefined, 0, { relaxed: true })
  ) {
    return
  }

  try {
    await replaceDocument(file.collectionName, file.originalDoc._id, newFields)
    previewFiles.set(filePath, { ...file, originalDoc: edited })
    file.dispatch({
      type: "SHOW_MESSAGE",
      message: "Updated document from tmux split",
      kind: "success",
    })
    file.dispatch({ type: "FREEZE_SELECTION" })
    file.dispatch({ type: "RELOAD_DOCUMENTS" })
  } catch (err) {
    file.dispatch({
      type: "SHOW_MESSAGE",
      message: `Document update failed: ${(err as Error).message}`,
      kind: "error",
    })
  }
}

function parseDocument(content: string): Document {
  const raw = JSON5.parse(stripComments(stripErrorComment(content)))
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Expected a single JSON document object")
  }
  return EJSON.deserialize(raw as Parameters<typeof EJSON.deserialize>[0]) as Document
}

function vimString(value: string): string {
  return value.replace(/'/g, "''")
}
