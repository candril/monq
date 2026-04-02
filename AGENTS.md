# Monq

A terminal-based MongoDB browser and query tool built with OpenTUI React. Keyboard-first interface for browsing collections, querying documents, and modifying data.

## Architecture Decisions

Before making structural changes, read the ADRs in `docs/adr/`. ADR-000 defines the format.

## Code Quality

**Run `just check` before finishing any task.** This runs typecheck + lint + format check. Fix all errors before creating a new change or considering work done. The goal is every change is clean.

- `just check` — run all checks (typecheck, lint, fmt)
- `just lint-fix` — auto-fix lint issues
- `just fmt` — auto-format files

## Keep Files Focused

Do not let files grow into catch-alls. Every file should have a single, clear responsibility. When a file starts doing too many things or gets hard to navigate, split it.

**Guidelines:**

- **No god files.** Don't pile unrelated logic into a convenient existing file (e.g. dumping everything into `App.tsx`, `state.ts`, `types.ts`, or `index.ts`). If you're adding something that doesn't belong to the file's core purpose, create a new file.
- **Extract when responsibilities diverge.** If a component handles its own complex state, keyboard bindings, data fetching, AND rendering — the non-rendering parts should be hooks or utilities.
- **Colocate by domain, not by kind.** Prefer putting related code together (e.g. `actions/pipeline.ts` next to `actions/pipelineWatch.ts`) over dumping all types into one `types.ts` or all utils into one `utils.ts`.
- **Watch file length as a signal.** Files over ~300 lines deserve a look — not an automatic split, but ask whether the file is doing more than one thing.

## Spec-Driven Development

**All features must have a spec before implementation.**

1. **Write the spec first** — Create `specs/NNN-feature-name.md` following the template in `specs/`
2. **Implement by priority** — P1 first, then P2, then P3
3. **Mark progress** — Update spec status as you work
4. **Update docs** — After implementation, update `README.md`, relevant `docs/`, and `site/src/`

Status flow: `Draft` → `Ready` → `In Progress` → `Done` (move to `specs/done/`)

## Commands

Use `just` for common tasks:

| Command | Description |
|---------|-------------|
| `just run` | Run the app |
| `just dev` | Run with hot reload |
| `just test` | Run tests |
| `just check` | Run all checks (typecheck + lint + fmt) |
| `just lint-fix` | Lint and auto-fix |
| `just fmt` | Format source files |
| `just build` | Build standalone binary |

## Version Control (jj)

> **Before starting ANY new task, create a new jj change first.**
> Run `jj new -m "Description of what you're about to do"` BEFORE making any edits.

1. Run `jj status` first
2. If the current change is empty and unnamed, `jj abandon` it before creating a new one
3. Create a new change: `jj new -m "Description of task"`
4. Make edits
5. Run `just check` and fix any issues before moving on

Do not leave stray empty changes. If you created a change with `jj new` but haven't made any edits yet, use `jj abandon` before creating a different change. Check `jj log` — there should be no empty unnamed changes in the history.

## Tech Stack

- **Runtime**: Bun
- **UI**: OpenTUI React — load the `opentui` skill for full component/API reference
- **Database**: MongoDB Node.js driver (`mongodb` package)
- **Typecheck**: `tsgo` (native Go port of TypeScript)
- **Lint/Format**: oxlint, oxfmt
- **State**: Single `useReducer` in `App.tsx` with a router in `src/state.ts` that delegates to domain sub-reducers in `src/state/reducers/` (connection, tabs, documents, query, pipeline, selection, ui)
