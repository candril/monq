/**
 * App version — injected at build time via `define: { MONQ_VERSION: "..." }`.
 * Falls back to the npm_package_version env var when running via `bun run`.
 */
declare const MONQ_VERSION: string

export const version: string =
  typeof MONQ_VERSION !== "undefined"
    ? MONQ_VERSION
    : (process.env.npm_package_version ?? "dev")
