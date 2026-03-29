/**
 * Resolves a ConnectionProfile to a concrete MongoDB URI.
 *
 * - For `uri` profiles: returns the value directly.
 * - For `uri_cmd` profiles: execs the command array (no shell), trims stdout.
 *   Throws if the command exits non-zero or produces no output.
 */

import type { ConnectionProfile } from "../config/connections"

export async function resolveUri(profile: ConnectionProfile): Promise<string> {
  if (profile.uri) {
    return profile.uri
  }

  if (profile.uri_cmd && profile.uri_cmd.length > 0) {
    const [cmd, ...args] = profile.uri_cmd

    let proc: ReturnType<typeof Bun.spawn>
    try {
      proc = Bun.spawn([cmd, ...args], {
        stdout: "pipe",
        stderr: "pipe",
      })
    } catch (err) {
      throw new Error(
        `uri_cmd "${cmd}" could not be started: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err },
      )
    }

    const [exitCode, stdoutText, stderrText] = await Promise.all([
      proc.exited,
      Bun.readableStreamToText(proc.stdout as ReadableStream),
      Bun.readableStreamToText(proc.stderr as ReadableStream),
    ])
    const uri = stdoutText.trim()

    if (exitCode !== 0) {
      const stderr = stderrText.trim()
      throw new Error(`uri_cmd "${cmd}" failed (exit ${exitCode})${stderr ? `: ${stderr}` : ""}`)
    }

    if (!uri) {
      throw new Error(`uri_cmd "${cmd}" produced no output`)
    }

    return uri
  }

  throw new Error(`Profile "${profile.name}" has neither uri nor uri_cmd`)
}
