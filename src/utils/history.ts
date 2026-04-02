/**
 * Query history — persisted to ~/.local/share/monq/history (XDG).
 * Simple newline-delimited file, capped at MAX_HISTORY entries.
 * Only simple-mode queries are stored.
 */

import { homedir } from "os"
import { join } from "path"
import { mkdir } from "fs/promises"

const MAX_HISTORY = 100

function historyPath(): string {
  const base = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share")
  return join(base, "monq", "history")
}

/** Load history from disk. Returns entries newest-first. Returns [] on any error. */
export async function loadHistory(): Promise<string[]> {
  try {
    const text = await Bun.file(historyPath()).text()
    const lines = text.split("\n").filter((l) => l.trim().length > 0)
    // File is stored oldest-first; reverse so index 0 = most recent
    return lines.reverse()
  } catch {
    return []
  }
}

/** Append a query to the history file, deduplicating and capping at MAX_HISTORY. */
export async function appendHistory(query: string): Promise<void> {
  const trimmed = query.trim()
  if (!trimmed) {
    return
  }

  try {
    const path = historyPath()
    await mkdir(join(path, ".."), { recursive: true })

    // Read existing entries (oldest-first in file)
    let existing: string[] = []
    try {
      const text = await Bun.file(path).text()
      existing = text.split("\n").filter((l) => l.trim().length > 0)
    } catch {
      // file doesn't exist yet — start fresh
    }

    // Remove duplicate of this entry (keep latest position)
    const deduped = existing.filter((l) => l !== trimmed)
    deduped.push(trimmed)

    // Cap at MAX_HISTORY (keep most recent)
    const capped = deduped.slice(-MAX_HISTORY)

    await Bun.write(path, capped.join("\n") + "\n")
  } catch {
    // History is best-effort — never crash on write failure
  }
}
