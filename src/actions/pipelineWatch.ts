/**
 * Pipeline file watcher — watches pipeline.jsonc for external saves and
 * triggers a reload in monq automatically (debounced 150ms).
 *
 * Also provides openTmuxSplit() for Ctrl+E: opens the pipeline file in a
 * new tmux pane (detached, monq keeps running) or copies the path to clipboard.
 */

import { watch, type FSWatcher } from "fs"
import { spawn } from "child_process"
import JSON5 from "json5"
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
    activeWatcher = watch(filePath, () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(onReload, 150)
    })
    // Ignore errors on the watcher itself (e.g. file deleted)
    activeWatcher.on("error", () => stopWatching())
  } catch {
    // File may not exist yet — that's fine, watcher just won't fire
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
export async function reloadFromFile(
  filePath: string,
  dispatch: Dispatch<AppAction>,
) {
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

  const pipeline: Document[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { pipeline?: Document[] }).pipeline)
      ? (parsed as { pipeline: Document[] }).pipeline
      : []

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
    const cmd = `${editor} "${filePath}"`
    spawn("tmux", ["split-window", splitFlag, "-p", pct, cmd], {
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
