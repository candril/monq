---
title: Key Bindings
description: Complete keyboard shortcut reference for monq.
tableOfContents:
  minHeadingLevel: 2
  maxHeadingLevel: 2
---

All bindings can be remapped in `~/.config/monq/config.toml`. See [Configuration](/monq/reference/configuration/#keybindings).

## Navigation

| Key | Action |
|-----|--------|
| `j` / `k` | Move down / up |
| `h` / `l` | Move column left / right |
| `Ctrl+D` / `Ctrl+U` | Scroll half page |
| `1`–`9`, `[`, `]` | Switch tabs |
| `t` | Clone current tab |
| `d` | Close tab |
| `u` | Undo close tab |
| `Ctrl+P` | Command palette |
| `q` | Quit |

## Database & Collection Management

| Key | Action |
|-----|--------|
| `Tab` | Create new database / collection (from welcome screen) |
| `Ctrl+D` | Drop database / collection (requires typing name to confirm) |

When on the welcome screen (database or collection picker):
- **Tab**: Opens an inline form to create a new database or collection
- **Ctrl+D**: Drops the currently selected database (from database list) or collection (from collection list). For safety, you must type the exact name to confirm.

When viewing an empty collection list, **Ctrl+D** drops the current database instead of trying to drop a collection.

## Querying

| Key | Action |
|-----|--------|
| `/` | Open query bar (simple mode) |
| `Tab` | Toggle simple ↔ BSON mode / switch to pipeline mode |
| `f` | Filter by value under cursor |
| `s` | Cycle sort on current column |
| `-` | Hide current column (adds `-field` projection token) |
| `w` | Cycle column width mode |
| `Shift+F` | Show / hide filter bar |
| `Ctrl+F` | Open pipeline editor in `$EDITOR` |
| `Ctrl+E` | Open pipeline file in tmux split (or copy path) |
| `Backspace` | Clear query / pipeline |

## Documents

| Key | Action |
|-----|--------|
| `p` / `P` | Toggle / cycle preview pane |
| `e` | Edit document in `$EDITOR` |
| `i` | Insert new document |
| `v` | Enter / freeze selection mode |
| `Space` | Toggle row selection |
| `o` | Jump cursor to selection end |
| `Ctrl+A` | Select all |
| `Shift+D` | Delete selected (with confirmation) |
| `y` / `Y` | Copy cell value / full document JSON |
| `r` | Reload |
