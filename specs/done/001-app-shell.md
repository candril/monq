# App Shell

**Status**: Done

## Description

Basic application shell with OpenTUI React. Connects to MongoDB via `--uri` flag, shows a header with connection info, and provides the foundational layout for all views. No status bar — discoverability comes from `Ctrl+P` command palette.

## Implementation Notes

- `--uri` flag parsed from `process.argv`
- URI with special chars (e.g. `&` in connection strings) handled via just quoting: `just run "$(vault abo-test)"`
- MongoDB client initialized lazily — actual connection on first operation
- URI parsed immediately for header display (host + dbName shown before connection)
- `useConsole: true` with `consoleOptions` required for stable TUI rendering
- `setInterval` keepalive in index.tsx to prevent Bun event loop exit
- `renderer.destroy()` + `process.exit(0)` for clean quit (Presto pattern)
- Braille spinner (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`) in header during loading
- Tree-sitter initialized before renderer for JSON syntax highlighting

## Key Files

- `src/index.tsx` — Entry point, tree-sitter init, renderer creation, arg parsing
- `src/App.tsx` — Main component, composes hooks and components
- `src/state.ts` — Full app state with useReducer
- `src/types.ts` — All type definitions
- `src/theme.ts` — Tokyo Night color palette
- `src/components/Shell.tsx` — Root layout wrapper
- `src/components/Header.tsx` — Title bar with spinner
- `src/components/Loading.tsx` — Full-screen loading + inline Spinner
- `src/components/ErrorView.tsx` — Error display
- `src/components/FilterBar.tsx` — Bottom filter bar (shows active query)
- `src/providers/mongodb.ts` — MongoDB connection, queries, EJSON serialization
- `src/syntax-parsers.ts` — Tree-sitter JSON parser registration

## Keyboard

| Key | Action |
|-----|--------|
| `q` | Quit (destroy renderer, exit process) |
| `Ctrl+P` | Open command palette |
