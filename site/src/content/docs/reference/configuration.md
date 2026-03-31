---
title: Configuration
description: Customise monq with a TOML config file — themes, keybindings, and saved connections.
---

monq is zero-config by default. Create `~/.config/monq/config.toml` to customise behaviour. The file is only read if it exists; missing sections fall back to built-in defaults.

## File location

```
$XDG_CONFIG_HOME/monq/config.toml   (if $XDG_CONFIG_HOME is set)
~/.config/monq/config.toml           (default)
```

## Keybindings

Remap any action to a different key or set of keys:

```toml
[keys]
"nav.down"  = ["j", "down"]
"nav.up"    = ["k", "up"]
"app.quit"  = "q"
```

**Key combo syntax:** plain letter, named key (`up`, `down`, `left`, `right`, `space`, `backspace`, `tab`, `escape`, `enter`), or modifier + key (`ctrl+p`, `shift+f`, `ctrl+shift+e`).

Assign an empty array to disable a binding entirely:

```toml
"app.quit" = []
```

All remappable actions:

| Action | Default | Description |
|--------|---------|-------------|
| `nav.down` | `j`, `down` | Move to next row |
| `nav.up` | `k`, `up` | Move to previous row |
| `nav.left` | `h`, `left` | Move column left |
| `nav.right` | `l`, `right` | Move column right |
| `nav.half_page_down` | `ctrl+d` | Half-page scroll down |
| `nav.half_page_up` | `ctrl+u` | Half-page scroll up |
| `nav.column_mode` | `w` | Cycle column width mode |
| `doc.reload` | `r` | Reload documents |
| `doc.filter_value` | `f` | Filter by current cell value |
| `doc.hide_column` | `-` | Hide current column |
| `doc.sort` | `s` | Cycle sort on current column |
| `doc.edit` | `e` | Edit document in `$EDITOR` |
| `doc.insert` | `i` | Insert new document |
| `doc.delete` | `D` | Delete selected document(s) |
| `doc.bulk_query_update` | _(none)_ | Bulk update via MongoDB query (`updateMany`) |
| `doc.bulk_query_delete` | _(none)_ | Bulk delete via MongoDB query (`deleteMany`) |
| `doc.yank_cell` | `y` | Copy cell to clipboard |
| `doc.yank_document` | `Y` | Copy full document JSON to clipboard |
| `preview.toggle` | `p` | Toggle preview panel |
| `preview.cycle_position` | `P` | Cycle preview position |
| `query.open` | `/` | Open query bar |
| `query.clear` | `backspace` | Clear current query / pipeline |
| `query.toggle_mode` | `tab` | Toggle simple ↔ BSON mode |
| `pipeline.open` | `ctrl+f` | Open pipeline in `$EDITOR` |
| `pipeline.open_full` | `ctrl+e` | Open pipeline in tmux split |
| `selection.toggle` | `v` | Enter / freeze selection mode |
| `selection.toggle_row` | `space` | Toggle current row |
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

## Theme preset

Pick one of the built-in colour themes:

```toml
theme_preset = "catppuccin-mocha"
```

Available presets:

| ID | Name |
|----|------|
| `tokyo-night` | Tokyo Night (default) |
| `catppuccin-mocha` | Catppuccin Mocha |
| `catppuccin-latte` | Catppuccin Latte (light) |
| `gruvbox-dark` | Gruvbox Dark |
| `nord` | Nord |
| `dracula` | Dracula |
| `solarized-dark` | Solarized Dark |
| `one-dark-pro` | One Dark Pro |
| `rose-pine` | Rosé Pine |
| `rose-pine-moon` | Rosé Pine Moon |
| `rose-pine-dawn` | Rosé Pine Dawn (light) |

You can also switch themes interactively at any time from the command palette (`Ctrl+P` → search "theme"). The selection is persisted across sessions and takes priority over `theme_preset` in the config file.

## Theme token overrides

Override individual colour tokens on top of a preset. Any unset tokens keep the preset's value.

```toml
theme_preset = "catppuccin-mocha"

[theme]
primary = "#ff9e64"
error   = "#ff5555"
```

All available tokens:

| Token | Description |
|-------|-------------|
| `bg` | Main background |
| `headerBg` | Header / tab bar background |
| `modalBg` | Modal / overlay background |
| `overlayBg` | Semi-transparent overlay |
| `selection` | Selected row highlight |
| `text` | Primary text |
| `textDim` | Dimmed / secondary text |
| `textMuted` | Muted / placeholder text |
| `primary` | Primary accent |
| `secondary` | Secondary accent |
| `success` | Success colour |
| `warning` | Warning colour |
| `error` | Error colour |
| `border` | Box borders |
| `jsonKey` | JSON object key |
| `jsonString` | JSON string value |
| `jsonNumber` | JSON number value |
| `jsonBoolean` | JSON boolean value |
| `jsonNull` | JSON null |
| `jsonObjectId` | MongoDB ObjectId |
| `jsonDate` | MongoDB Date |
| `jsonBracket` | JSON brackets |
| `tabActive` | Active tab label |
| `tabInactive` | Inactive tab label |
| `querySimple` | Simple query mode indicator |
| `queryBson` | BSON query mode indicator |

## Connections

Named connection profiles let you launch monq without typing a URI every time. When at least one profile is configured, monq shows a connection picker on startup.

```toml
[connections.local]
name = "Local Dev"
uri  = "mongodb://localhost:27017"

[connections.atlas]
name = "Atlas Staging"
uri  = "mongodb+srv://user:pass@cluster.mongodb.net/mydb"

[connections.prod]
name    = "Production"
uri_cmd = ["op", "read", "op://vault/mongo-prod/uri"]
```

Each entry requires either `uri` (a literal MongoDB URI) or `uri_cmd` (a command whose stdout resolves to one). `uri_cmd` is executed directly — no shell — so secrets never need to appear in the config file.

### Skipping the connection picker

Pass `--uri` on the command line to bypass the connection picker entirely:

```sh
monq --uri mongodb://localhost:27017/mydb
```
