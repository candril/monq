# Command Palette: Dynamic Key Hints from Config

**Status**: Ready

## Description

The command palette currently displays hardcoded key binding hints (e.g., "Ctrl+P") in
its UI, even when the user has customized those bindings in `config.toml`. It should
instead read the actual configured keymaps and display the correct binding for each
command.

## Out of Scope

- Changing the command palette UI layout or styling
- Supporting multiple bindings per command in the hint text (show only the first/primary)
- Validating or warning about conflicting key bindings

---

## Capabilities

### P1 — Must Have

- Command palette hint text (e.g., "⌃P" or "Ctrl+P") reflects the actual key binding
  configured in `keymap.toml` for that action
- If a user rebinds `palette.open` from `Ctrl+P` to `Ctrl+Space`, the palette shows
  "⌃Space" instead of "⌃P"
- Works for all commands that display key hints in the palette

### P2 — Should Have

- If a command has no key binding configured, show an empty string or a subtle "—"
  instead of a placeholder
- Hint formatting matches the existing style (e.g., `⌃` for Ctrl, `⇧` for Shift on macOS)

### P3 — Nice to Have

- When multiple bindings map to the same action, show the shortest or most common one
- Abbreviate long key combos gracefully (e.g., "⌃⇧⌘A" instead of full text)

---

## Technical Notes

### Current implementation

Commands are defined in `src/commands/builder.ts` with hardcoded key strings:

```typescript
export function buildCommands(state: AppState): PaletteCommand[] {
  return [
    {
      id: "command-palette",
      label: "Command palette",
      key: "⌃P",  // ← Hardcoded
      action: "command-palette",
    },
    // ...
  ]
}
```

### Proposed fix

Pass the active `keymap` configuration into `buildCommands` and derive the `key` hint
dynamically from the keymap:

```typescript
import type { Keymap } from "../config/types"
import { formatKeyHint } from "../utils/keymap"  // new utility

export function buildCommands(state: AppState, keymap: Keymap): PaletteCommand[] {
  return [
    {
      id: "command-palette",
      label: "Command palette",
      key: formatKeyHint(keymap["palette.open"]),  // ← Dynamic
      action: "command-palette",
    },
    // ...
  ]
}
```

### Key hint formatting utility

Create a new helper `formatKeyHint()` in `src/utils/keymap.ts` to convert a key binding
object into a short display string:

```typescript
import type { KeyBinding } from "../config/types"

export function formatKeyHint(binding: KeyBinding | KeyBinding[]): string {
  const b = Array.isArray(binding) ? binding[0] : binding
  if (!b) return ""
  
  let hint = ""
  if (b.ctrl) hint += "⌃"
  if (b.shift) hint += "⇧"
  if (b.alt) hint += "⌥"
  if (b.meta) hint += "⌘"
  
  // Capitalize single letters, show special keys as-is
  const key = b.key.length === 1 ? b.key.toUpperCase() : b.key
  return hint + key
}
```

### Callsites to update

1. `buildCommands()` in `src/commands/builder.ts`
2. `buildCollectionCommands()` in `src/commands/collections.ts` (if it shows hints)
3. `buildDatabaseCommands()` in `src/commands/databases.ts` (if it shows hints)
4. `buildThemeCommands()` in `src/commands/themes.ts` (if it shows hints)

Pass `keymap` as an additional parameter to each builder, called from `App.tsx`:

```typescript
// App.tsx
const mainCommands = useMemo(() => buildCommands(state, keymap), [state, keymap])
```

### Testing

1. Open the command palette (default: Ctrl+P) — verify it shows "⌃P" for the palette
   command
2. Edit `config.toml` to rebind `palette.open` to `ctrl+k`
3. Restart the app, open the palette — verify it now shows "⌃K"
4. Unbind a command (or set it to an empty binding) — verify the hint is blank or "—"

---

## File Structure

**New files:**
```
src/utils/keymap.ts             # formatKeyHint() utility
```

**Modified files:**
```
src/commands/builder.ts         # Accept keymap param, use formatKeyHint()
src/commands/collections.ts     # Accept keymap param (if needed)
src/commands/databases.ts       # Accept keymap param (if needed)
src/commands/themes.ts          # Accept keymap param (if needed)
src/App.tsx                     # Pass keymap to buildCommands() and other builders
```
