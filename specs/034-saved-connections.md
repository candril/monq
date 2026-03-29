# Saved Connection Profiles

**Status**: In Progress

## Description

Named connection profiles stored in `~/.config/monq/config.toml`. Each profile
has a display name and either a literal MongoDB URI or a command whose stdout
resolves to one, so secrets never touch the config file.

## Out of Scope

- In-TUI editing of profiles (edit the TOML file directly)
- Encrypting or managing secrets (delegate to external tools via `uri_cmd`)
- Per-project config files
- Connection groups / folders
- Testing connectivity without connecting

---

## Capabilities

### P1 — Must Have

- **Config section `[connections.*]`** — each entry has a `name` string and
  either `uri` (literal) or `uri_cmd` (array of strings, exec'd directly).
- **`ConnectionScreen`** — shown on `monq` launch when at least one profile
  exists. Lists profiles with `j/k` navigation and `Enter` to connect. A
  "Connect with custom URI…" option always appears at the bottom.
- **`uri_cmd` resolution** — exec the command array directly (no shell),
  capture stdout (trimmed), use it as the URI. Show a spinner while running.
  If the command fails or returns a non-zero exit code, show an error and
  return to the list.
- **`--uri` bypass** — when `--uri` is supplied on the command line,
  `ConnectionScreen` is skipped entirely (existing behaviour preserved).
- **Zero-config fallback** — if no `[connections]` entries exist (or the file
  doesn't exist), go straight to the existing `UriScreen`.

### P2 — Should Have

- **`--connections` flag** — force `ConnectionScreen` even when `--uri` is
  supplied, useful for scripting / aliases.
- **Highlight last-used connection** — persist the last-selected profile key
  to `~/.local/share/monq/last-connection` and pre-select it on next launch.
- **Integrate with spec 033** — share the same `config.toml` file; the
  `[connections.*]` section coexists with `[theme]` and `[keys]`.

### P3 — Nice to Have

- **In-TUI "open config" shortcut** — press `e` on a profile to open the
  config file in `$EDITOR` at the relevant line.
- **Connection labels / tags** — optional `tags = ["prod", "eu"]` field;
  shown in the list and filterable.

---

## Technical Notes

### Config format

```toml
# ~/.config/monq/config.toml

[connections.local]
name = "Local Dev"
uri  = "mongodb://localhost:27017"

[connections.prod]
name    = "Production"
uri_cmd = ["vault", "prod-mongo-uri"]

[connections.staging]
name    = "Staging (1Password)"
uri_cmd = ["op", "read", "op://vault/staging/uri"]
```

Rules:
- Exactly one of `uri` or `uri_cmd` must be present per entry.
- `uri_cmd` is an array of strings; the first element is the executable,
  the rest are arguments. No shell interpretation.
- The connection key (`local`, `prod`, …) is used as a stable ID for
  last-used persistence (P2).

### Config loading

```typescript
// src/config/connections.ts
import { homedir } from "os"
import { join } from "path"

export interface ConnectionProfile {
  key: string          // TOML table key, e.g. "prod"
  name: string
  uri?: string
  uri_cmd?: string[]
}

export async function loadProfiles(): Promise<ConnectionProfile[]> {
  const xdgBase = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config")
  const configPath = join(xdgBase, "monq", "config.toml")
  const file = Bun.file(configPath)
  if (!(await file.exists())) return []

  const raw = Bun.TOML.parse(await file.text()) as Record<string, unknown>
  const connections = (raw.connections ?? {}) as Record<string, unknown>

  return Object.entries(connections).map(([key, value]) => ({
    key,
    ...(value as Omit<ConnectionProfile, "key">),
  }))
}
```

### URI resolution

```typescript
// src/utils/resolveUri.ts
export async function resolveUri(profile: ConnectionProfile): Promise<string> {
  if (profile.uri) return profile.uri

  if (profile.uri_cmd) {
    const [cmd, ...args] = profile.uri_cmd
    const proc = Bun.spawn([cmd, ...args], { stdout: "pipe", stderr: "pipe" })
    const exitCode = await proc.exited
    if (exitCode !== 0) {
      const stderr = await new Response(proc.stderr).text()
      throw new Error(`uri_cmd failed (exit ${exitCode}): ${stderr.trim()}`)
    }
    const uri = (await new Response(proc.stdout).text()).trim()
    if (!uri) throw new Error("uri_cmd produced no output")
    return uri
  }

  throw new Error(`Profile "${profile.name}" has neither uri nor uri_cmd`)
}
```

### Routing in `src/index.tsx`

```
startup
  ├── --uri flag present → connect directly (existing UriScreen/App flow)
  └── load profiles
       ├── profiles.length > 0 → show ConnectionScreen
       └── no profiles        → show UriScreen (existing)
```

### `ConnectionScreen` behaviour

- Full-screen list, same shell chrome as `UriScreen`.
- Items: one row per profile showing `name` and a dim hint (`uri` host or
  `[cmd arg…]` for `uri_cmd`).
- Last item is always `"Connect with custom URI…"` which opens `UriScreen`.
- Keys: `j/k` or arrows to navigate, `Enter` to connect, `q`/`Escape` to quit.
- On `Enter` for a `uri_cmd` profile: show spinner ("Resolving…"), exec
  command, on success hand URI to `App`; on failure show inline error and
  re-enable navigation.

---

## File Structure

**New files:**
```
specs/034-saved-connections.md          (this file)
src/config/connections.ts               # loadProfiles(), ConnectionProfile type
src/utils/resolveUri.ts                 # resolveUri(profile): Promise<string>
src/components/ConnectionScreen.tsx     # list UI
```

**Modified files:**
```
src/index.tsx    # load profiles at startup, route to ConnectionScreen or UriScreen
```
