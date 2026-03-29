/**
 * Connection profile loading from ~/.config/monq/config.toml
 *
 * Config format:
 *
 *   [connections.local]
 *   name = "Local Dev"
 *   uri  = "mongodb://localhost:27017"
 *
 *   [connections.prod]
 *   name    = "Production"
 *   uri_cmd = ["vault", "prod-mongo-uri"]
 */

import { homedir } from "os"
import { join } from "path"

export interface ConnectionProfile {
  /** TOML table key, e.g. "prod" — used as stable ID */
  key: string
  /** Display name shown in ConnectionScreen */
  name: string
  /** Literal MongoDB URI — mutually exclusive with uri_cmd */
  uri?: string
  /** Command to exec (no shell); stdout becomes the URI — mutually exclusive with uri */
  uri_cmd?: string[]
}

function configPath(): string {
  const xdgBase = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config")
  return join(xdgBase, "monq", "config.toml")
}

/**
 * Load connection profiles from config.toml.
 * Returns an empty array if the file doesn't exist or has no [connections] section.
 */
export async function loadProfiles(): Promise<ConnectionProfile[]> {
  const file = Bun.file(configPath())
  if (!(await file.exists())) return []

  let raw: Record<string, unknown>
  try {
    raw = Bun.TOML.parse(await file.text()) as Record<string, unknown>
  } catch {
    // Malformed TOML — fail silently, fall back to UriScreen
    return []
  }

  const connections = raw.connections
  if (!connections || typeof connections !== "object" || Array.isArray(connections)) {
    return []
  }

  return Object.entries(connections as Record<string, unknown>)
    .filter(([, value]) => value !== null && typeof value === "object")
    .map(([key, value]) => ({
      key,
      ...(value as Omit<ConnectionProfile, "key">),
    }))
    .filter(
      (p): p is ConnectionProfile =>
        typeof p.name === "string" && (!!p.uri || Array.isArray(p.uri_cmd)),
    )
}

/**
 * Returns a short hint string for display next to the profile name.
 * e.g. "localhost:27017" or "[vault prod-mongo-uri]"
 */
export function profileHint(profile: ConnectionProfile): string {
  if (profile.uri) {
    try {
      const url = new URL(profile.uri)
      return url.host || profile.uri
    } catch {
      return profile.uri
    }
  }
  if (profile.uri_cmd) {
    return `[${profile.uri_cmd.join(" ")}]`
  }
  return ""
}
