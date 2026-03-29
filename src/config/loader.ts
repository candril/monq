/**
 * Config file loader.
 * Reads $XDG_CONFIG_HOME/monq/config.toml (default ~/.config/monq/config.toml).
 * Returns the raw parsed object (UserConfig-shaped) or null if the file is missing.
 * Does NOT validate — call validateConfig() on the result.
 */

import { homedir } from "os"
import { join } from "path"
import type { UserConfig } from "./types"

export function configPath(): string {
  const xdgBase = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config")
  return join(xdgBase, "monq", "config.toml")
}

/**
 * Load the user config file.
 * Returns null if the file does not exist.
 * Returns an empty object {} if the file exists but has no [theme] or [keys] sections.
 * Throws if the file exists but is not valid TOML.
 */
export async function loadConfig(): Promise<UserConfig | null> {
  const file = Bun.file(configPath())
  if (!(await file.exists())) return null

  const raw = Bun.TOML.parse(await file.text()) as Record<string, unknown>

  const result: UserConfig = {}

  if (typeof raw.theme_preset === "string" && raw.theme_preset.length > 0) {
    result.themePreset = raw.theme_preset
  }

  if (raw.theme && typeof raw.theme === "object" && !Array.isArray(raw.theme)) {
    result.theme = raw.theme as UserConfig["theme"]
  }

  if (raw.keys && typeof raw.keys === "object" && !Array.isArray(raw.keys)) {
    result.keys = raw.keys as UserConfig["keys"]
  }

  return result
}
