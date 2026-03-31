# Configuration System

**Status**: Done

## Description

An optional TOML configuration file that lets users customise keybindings and the colour theme without touching source code. The app remains fully zero-config by default — the file is only read when it exists.

## Out of Scope

- Saved connections / connection profiles
- Per-project config files (only global `~/.config/monq/config.toml`)
- CLI flag overrides for individual config keys (that is a separate spec)
- Plugin or extension system
- Non-colour theme properties (font, spacing, border style)

---

## Capabilities

### P1 — Must Have

- **Config file discovery** — read `$XDG_CONFIG_HOME/monq/config.toml` (default `~/.config/monq/config.toml`) at startup. If the file does not exist, use all defaults silently.
- **Theme customisation** — a `[theme]` section accepts hex colour overrides for every token in `src/theme.ts`. Unset tokens fall back to the built-in Tokyo Night defaults.
- **Keybinding remapping** — a `[keys]` section maps action names to one or more key combos. The full action catalogue is listed below. Any unset action keeps its default binding.
- **Validation with helpful errors** — unknown keys, malformed hex colours, or unrecognised action names are reported as startup warnings in the toast system (not fatal errors).

---

## Technical Notes

### Config file location

```
$XDG_CONFIG_HOME/monq/config.toml   (if $XDG_CONFIG_HOME is set)
~/.config/monq/config.toml           (fallback)
```

Resolution code:
```typescript
const xdgBase = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config")
const configPath = path.join(xdgBase, "monq", "config.toml")
```

### Config file format

```toml
# Optional: pick a built-in theme preset (P2)
# theme = "catppuccin-mocha"

[theme]
# Override individual colour tokens (hex only)
bg         = "#1a1b26"
primary    = "#7aa2f7"
error      = "#f7768e"
# ... any subset of the tokens below

[keys]
# Map action names to key combos.
# Each value is a string or array of strings.
# Key combo syntax: plain letter, or modifier+letter (ctrl+p, shift+f)
"nav.down"          = ["j", "down"]
"nav.up"            = ["k", "up"]
"doc.reload"        = "r"
"app.quit"          = "q"
```

### Theme tokens

All tokens from `src/theme.ts` are configurable:

| Token | Default (Tokyo Night) | Description |
|---|---|---|
| `bg` | `#1a1b26` | Main background |
| `headerBg` | `#24283b` | Header/tab bar background |
| `modalBg` | `#16161e` | Modal / overlay background |
| `overlayBg` | `#00000080` | Semi-transparent overlay |
| `selection` | `#33467c` | Selected row highlight |
| `text` | `#c0caf5` | Primary text |
| `textDim` | `#565f89` | Dimmed / secondary text |
| `textMuted` | `#414868` | Muted / placeholder text |
| `primary` | `#7aa2f7` | Primary accent (blue) |
| `secondary` | `#bb9af7` | Secondary accent (purple) |
| `success` | `#9ece6a` | Success / green |
| `warning` | `#e0af68` | Warning / orange |
| `error` | `#f7768e` | Error / red |
| `border` | `#414868` | Box borders |
| `jsonKey` | `#7aa2f7` | JSON object key |
| `jsonString` | `#9ece6a` | JSON string value |
| `jsonNumber` | `#ff9e64` | JSON number value |
| `jsonBoolean` | `#bb9af7` | JSON boolean value |
| `jsonNull` | `#565f89` | JSON null |
| `jsonObjectId` | `#e0af68` | MongoDB ObjectId |
| `jsonDate` | `#e0af68` | MongoDB Date |
| `jsonBracket` | `#565f89` | JSON brackets |
| `tabActive` | `#7aa2f7` | Active tab label |
| `tabInactive` | `#565f89` | Inactive tab label |
| `querySimple` | `#9ece6a` | Simple query mode indicator |
| `queryBson` | `#e0af68` | BSON query mode indicator |

### Action catalogue

Every remappable action and its default key combo(s):

| Action name | Default key(s) | Description |
|---|---|---|
| `nav.down` | `j`, `down` | Move to next document |
| `nav.up` | `k`, `up` | Move to previous document |
| `nav.left` | `h`, `left` | Move column left |
| `nav.right` | `l`, `right` | Move column right |
| `nav.half_page_down` | `ctrl+d` | Half-page scroll down |
| `nav.half_page_up` | `ctrl+u` | Half-page scroll up |
| `nav.column_mode` | `w` | Cycle column display mode |
| `doc.reload` | `r` | Reload documents |
| `doc.filter_value` | `f` | Filter by current cell value |
| `doc.hide_column` | `-` | Hide / show current column |
| `doc.sort` | `s` | Cycle sort on current column |
| `doc.edit` | `e` | Edit selected document in $EDITOR |
| `doc.insert` | `i` | Insert new document |
| `doc.delete` | `D` (shift+d) | Delete selected document(s) |
| `doc.yank_cell` | `y` | Copy current cell to clipboard |
| `doc.yank_document` | `Y` (shift+y) | Copy whole document to clipboard |
| `preview.toggle` | `p` | Toggle preview panel |
| `preview.cycle_position` | `P` (shift+p) | Cycle preview position (right / bottom / off) |
| `query.open` | `/` | Open query bar |
| `query.clear` | `backspace` | Clear current query / pipeline |
| `query.toggle_mode` | `tab` | Toggle simple ↔ BSON mode |
| `pipeline.open` | `ctrl+f` | Open pipeline editor |
| `pipeline.open_full` | `ctrl+e` | Open pipeline in $EDITOR |
| `selection.toggle` | `v` | Enter / freeze visual selection mode |
| `selection.toggle_row` | `space` | Toggle current row in selection |
| `selection.jump_end` | `o` | Jump cursor to selection end |
| `selection.select_all` | `ctrl+a` | Select all documents |
| `tab.clone` | `t` | Clone current tab |
| `tab.close` | `d` | Close current tab |
| `tab.undo_close` | `u` | Re-open last closed tab |
| `tab.prev` | `[` | Go to previous tab |
| `tab.next` | `]` | Go to next tab |
| `tab.switch_1`–`tab.switch_9` | `1`–`9` | Switch to tab N |
| `filter_bar.toggle` | `shift+f` | Show / hide filter bar |
| `palette.open` | `ctrl+p` | Open command palette |
| `app.quit` | `q` | Quit monq |

### Key combo syntax

A key combo is a string with optional modifiers joined by `+`:

```
"j"           # plain letter (case-sensitive: "J" = shift+j)
"down"        # named key: up, down, left, right, space, backspace, tab, escape, enter
"ctrl+p"      # Ctrl modifier
"shift+f"     # Shift modifier  (equivalent to uppercase letter for single chars)
"ctrl+shift+e"  # multiple modifiers
```

Multiple combos for one action:
```toml
"nav.down" = ["j", "down"]
```

Disable a default binding (assign empty string or empty array):
```toml
"app.quit" = []   # removes all default bindings for quit
```

### Implementation layers

```
src/config/
├── types.ts       # UserConfig, ResolvedConfig, ThemeConfig, KeysConfig types
├── loader.ts      # readConfigFile(): reads + parses TOML, returns UserConfig | null
├── merge.ts       # mergeConfig(user): applies user overrides onto defaults → ResolvedConfig
├── validate.ts    # validateConfig(raw): returns { valid, warnings[] }
└── keymap.ts      # buildKeymap(keys): action name → KeyCombo[] lookup, used by hooks
```

`src/theme.ts` becomes a function that accepts a `ThemeConfig`:
```typescript
export function buildTheme(overrides: Partial<ThemeConfig> = {}): Theme {
  return { ...tokyoNight, ...overrides }
}
```

Keybinding hooks (`useKeyboardNav`, `usePipelineKeys`, `useDocumentEditKeys`) receive a `keymap` prop instead of hard-coding key names. Each action check becomes:

```typescript
// before
if (key.name === "j" || key.name === "down") { ... }

// after
if (matches(key, keymap["nav.down"])) { ... }
```

Where `matches(key, combos)` is a pure utility in `src/utils/keymap.ts`.

### Config is read once at startup

Config is loaded in `src/index.tsx` before the renderer is created and passed down via React context (`ConfigContext`). No hot-reload for P1; SIGHUP reload is a P3 addition.

---

## File Structure

**New files:**
```
src/config/
├── types.ts
├── loader.ts
├── merge.ts
├── validate.ts
└── keymap.ts
src/utils/keymap.ts         # matches(key, combos[]) pure helper
src/contexts/ConfigContext.tsx
```

**Modified files:**
```
src/index.tsx               # load config before renderer, wrap app in ConfigContext
src/theme.ts                # export buildTheme(overrides) instead of plain object
src/App.tsx                 # consume ConfigContext, pass theme + keymap to children
src/hooks/useKeyboardNav.ts # accept keymap, use matches() helper
src/hooks/usePipelineKeys.ts
src/hooks/useDocumentEditKeys.ts
src/hooks/useDialogKeys.ts
```

**No new dependencies required.** TOML parsing via `Bun.TOML` (built into Bun runtime — no npm package needed).
