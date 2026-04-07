/**
 * Query history — persisted to ~/.local/share/monq/history (XDG).
 * JSON-lines: one {db, q} per line, capped at MAX_HISTORY entries globally.
 * Only simple-mode queries are stored. Entries are scoped to the database
 * they were submitted against; the picker filters by current db at render time.
 */

import { homedir } from "os"
import { join } from "path"
import { mkdir } from "fs/promises"

const MAX_HISTORY = 100

export interface HistoryEntry {
  db: string
  q: string
}

function historyPath(): string {
  const base = process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share")
  return join(base, "monq", "history")
}

function parseLine(line: string): HistoryEntry | null {
  const trimmed = line.trim()
  if (!trimmed) {
    return null
  }
  try {
    const obj = JSON.parse(trimmed) as unknown
    if (
      obj &&
      typeof obj === "object" &&
      typeof (obj as HistoryEntry).db === "string" &&
      typeof (obj as HistoryEntry).q === "string"
    ) {
      return { db: (obj as HistoryEntry).db, q: (obj as HistoryEntry).q }
    }
  } catch {
    // Legacy plain-text entry (pre-scoping) — drop it; can't be safely attributed.
  }
  return null
}

/** Load history from disk. Returns entries newest-first. Returns [] on any error. */
export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    const text = await Bun.file(historyPath()).text()
    const parsed: HistoryEntry[] = []
    for (const line of text.split("\n")) {
      const entry = parseLine(line)
      if (entry) {
        parsed.push(entry)
      }
    }
    // File is stored oldest-first; reverse so index 0 = most recent
    return parsed.reverse()
  } catch {
    return []
  }
}

/** Append a query to the history file, deduplicating per (db, q) and capping at MAX_HISTORY. */
export async function appendHistory(query: string, db: string): Promise<void> {
  const trimmed = query.trim()
  if (!trimmed) {
    return
  }

  try {
    const path = historyPath()
    await mkdir(join(path, ".."), { recursive: true })

    // Read existing entries (oldest-first in file)
    const existing: HistoryEntry[] = []
    try {
      const text = await Bun.file(path).text()
      for (const line of text.split("\n")) {
        const entry = parseLine(line)
        if (entry) {
          existing.push(entry)
        }
      }
    } catch {
      // file doesn't exist yet — start fresh
    }

    // Remove duplicate within the same db (keep latest position)
    const deduped = existing.filter((e) => !(e.db === db && e.q === trimmed))
    deduped.push({ db, q: trimmed })

    // Cap at MAX_HISTORY (keep most recent)
    const capped = deduped.slice(-MAX_HISTORY)

    const content = capped.map((e) => JSON.stringify(e)).join("\n") + "\n"
    await Bun.write(path, content)
  } catch {
    // History is best-effort — never crash on write failure
  }
}
