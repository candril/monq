/**
 * Pipeline file watcher — watches pipeline.jsonc for external saves and
 * triggers a reload in monq automatically (debounced 150ms).
 *
 * Also provides openTmuxSplit() for Ctrl+E: opens the pipeline file in a
 * new tmux pane (detached, monq keeps running) or copies the path to clipboard.
 */

import { watch, type FSWatcher } from "fs"
import { dirname, basename } from "path"
import { spawn } from "child_process"
import JSON5 from "json5"
import { EJSON } from "bson"
import type { Document } from "mongodb"
import type { Dispatch } from "react"
import type { AppAction } from "../state"
import { classifyPipeline } from "./pipeline"

// ── Singleton watcher ────────────────────────────────────────────────────────

let activeWatcher: FSWatcher | null = null
let debounceTimer: ReturnType<typeof setTimeout> | null = null

export function startWatching(filePath: string, onReload: () => void) {
  stopWatching()
  try {
    const dir = dirname(filePath)
    const filename = basename(filePath)
    // Watch the directory rather than the file so atomic saves (rename-based
    // writes from nvim, vim, etc.) are detected reliably. Watching the file
    // directly loses the watch after the first atomic rename.
    activeWatcher = watch(dir, (_event, name) => {
      if (name !== filename) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(onReload, 150)
    })
    // Ignore errors on the watcher itself (e.g. directory deleted)
    activeWatcher.on("error", () => stopWatching())
  } catch {
    // Directory may not exist yet — that's fine, watcher just won't fire
  }
}

export function stopWatching() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (activeWatcher) {
    activeWatcher.close()
    activeWatcher = null
  }
}

// ── File reload ──────────────────────────────────────────────────────────────

/**
 * Read and parse the pipeline file, then dispatch SET_PIPELINE.
 * On parse error: dispatch a warning toast (do not clear the existing pipeline).
 */
export async function reloadFromFile(filePath: string, dispatch: Dispatch<AppAction>) {
  let content: string
  try {
    content = await Bun.file(filePath).text()
  } catch {
    return // file gone — ignore
  }

  let parsed: { pipeline?: Document[] } | Document[]
  try {
    parsed = JSON5.parse(content)
  } catch (err) {
    dispatch({
      type: "SHOW_MESSAGE",
      message: `Pipeline parse error: ${(err as Error).message}`,
      kind: "warning",
    })
    return
  }

  const rawPipeline: Document[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { pipeline?: Document[] }).pipeline)
      ? (parsed as { pipeline: Document[] }).pipeline
      : []

  // Deserialize EJSON extended types (e.g. { "$oid": "..." } → ObjectId)
  // so that filters on typed fields like _id work correctly against MongoDB.
  const pipeline = EJSON.deserialize(rawPipeline) as Document[]

  if (pipeline.length === 0) return

  const isAggregate = classifyPipeline(pipeline)
  dispatch({
    type: "SET_PIPELINE",
    pipeline,
    source: content,
    isAggregate,
  })
}

// ── Tmux split ───────────────────────────────────────────────────────────────

/**
 * Open the pipeline file in a new tmux split pane (detached — monq keeps running).
 * If not inside tmux, copy the file path to clipboard via OSC 52 instead.
 *
 * Split direction controlled by MONQ_TMUX_SPLIT env var:
 *   "h" = horizontal (stacked, -v in tmux terms)
 *   "v" = vertical side-by-side (default, -h in tmux terms)
 */
export function openTmuxSplit(filePath: string): "tmux" | "clipboard" | "none" {
  const editor = process.env.EDITOR ?? process.env.VISUAL ?? "nvim"
  const editorBase = editor.split("/").pop() ?? editor

  if (process.env.TMUX) {
    const splitFlag = process.env.MONQ_TMUX_SPLIT === "h" ? "-v" : "-h"
    const pct = "50"
    // Pass editor and filepath as separate argv elements so tmux exec's the
    // editor directly rather than trying to exec a shell command string.
    // Any extra args from $EDITOR (e.g. "nvim --noplugin") are split here too.
    const editorArgs = editor.split(/\s+/)
    spawn("tmux", ["split-window", splitFlag, "-p", pct, ...editorArgs, filePath], {
      detached: true,
      stdio: "ignore",
    }).unref()
    return "tmux"
  }

  // Not in tmux — copy path to clipboard via OSC 52
  try {
    const b64 = Buffer.from(filePath).toString("base64")
    process.stdout.write(`\x1b]52;c;${b64}\x07`)
    return "clipboard"
  } catch {
    return "none"
  }
}
