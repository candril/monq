/**
 * Persistent theme state via XDG state file.
 *
 * Reads/writes $XDG_STATE_HOME/monq/state.toml (default ~/.local/state/monq/state.toml).
 * This is intentionally separate from config.toml so declarative configs
 * (e.g. Nix home-manager) are never touched by the app at runtime.
 *
 * File format:
 *   theme_preset = "dracula"
 */

import { homedir } from "os"
import { join, dirname } from "path"
import { mkdirSync } from "fs"

function statePath(): string {
  const xdgBase = process.env.XDG_STATE_HOME ?? join(homedir(), ".local", "state")
  return join(xdgBase, "monq", "state.toml")
}

/**
 * Read the persisted theme preset ID from the state file.
 * Returns null if the file doesn't exist or has no theme_preset entry.
 */
export async function loadStateTheme(): Promise<string | null> {
  const file = Bun.file(statePath())
  if (!(await file.exists())) {
    return null
  }
  try {
    const raw = Bun.TOML.parse(await file.text()) as Record<string, unknown>
    const val = raw.theme_preset
    return typeof val === "string" && val.length > 0 ? val : null
  } catch {
    return null
  }
}

/**
 * Persist the chosen theme preset ID to the state file.
 * Creates the directory if needed. Fails silently on write errors.
 */
export async function saveStateTheme(presetId: string): Promise<void> {
  const path = statePath()
  try {
    mkdirSync(dirname(path), { recursive: true })
    await Bun.write(path, `theme_preset = ${JSON.stringify(presetId)}\n`)
  } catch {
    // Non-fatal — running on a read-only FS or similar edge case
  }
}

/**
 * Clear the persisted theme from the state file (reset to config/default).
 * Writes an empty state file rather than deleting, to avoid surprising the user.
 */
export async function clearStateTheme(): Promise<void> {
  const path = statePath()
  try {
    mkdirSync(dirname(path), { recursive: true })
    await Bun.write(path, "")
  } catch {
    // Non-fatal
  }
}
