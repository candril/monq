/**
 * App version — injected at build time via `define: { MONQ_VERSION: "..." }`.
 * Falls back to a short git commit hash when running via `bun run` / `just dev`.
 */
declare const MONQ_VERSION: string

function devVersion(): string {
  try {
    const result = Bun.spawnSync(["git", "rev-parse", "--short", "HEAD"])
    if (result.exitCode === 0) {
      return `dev-${result.stdout.toString().trim()}`
    }
  } catch {
    // ignore
  }
  return "dev"
}

export const version: string =
  typeof MONQ_VERSION !== "undefined" ? MONQ_VERSION : devVersion()
