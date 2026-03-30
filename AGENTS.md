# Monq

A terminal-based MongoDB browser and query tool built with OpenTUI React. Browse collections, query documents, and modify data with a keyboard-first interface.

## Architecture Decisions

Before making structural changes, read the ADRs in `docs/adr/`. They capture the key decisions and their rationale. ADR-000 defines the format.

## Spec-Driven Development

**All features must have a spec before implementation.**

### Workflow

1. **Write the spec first** - Create `specs/NNN-feature-name.md` following the template
2. **Review the spec** - Ensure it covers capabilities, technical notes, and file structure
3. **Implement by priority** - P1 first, then P2, then P3
4. **Mark progress** - Update spec status as you work
5. **Update docs** - After implementation, update `README.md`, any relevant files in `docs/`, and the site (`site/src/`) to reflect the new feature

### Spec Structure

```markdown
# Feature Name

**Status**: Draft | Ready | In Progress | Done

## Description
What this feature does in 2-3 sentences.

## Out of Scope
What this feature explicitly does NOT do.

## Capabilities

### P1 - Must Have
- Core functionality

### P2 - Should Have
- Important enhancements

### P3 - Nice to Have
- Polish and extras

## Technical Notes
Implementation details, code examples, API usage.

## File Structure
Which files to create/modify.
```

### Spec Status Flow

1. `Draft` - Being written, not ready
2. `Ready` - Reviewed, ready for implementation
3. `In Progress` - Currently being implemented
4. `Done` - Complete, move to `specs/done/`

## Commands

Use `just` for common tasks:

| Command | Description |
|---------|-------------|
| `just run` | Run the app |
| `just dev` | Run with hot reload |
| `just test` | Run tests |
| `just typecheck` | Type check |
| `just build` | Build standalone binary |

## Version Control (jj)

> **SUPER IMPORTANT**: Before starting ANY new task or topic, you MUST create a new jj change!
> Run `jj new -m "Description of what you're about to do"` FIRST, before making any edits.
> This keeps changes atomic and easy to review. NO EXCEPTIONS!

### Before starting a task

1. **ALWAYS** run `jj status` first
2. **ALWAYS** create a new change: `jj new -m "Description of task"`
3. Only then start making edits

## Tech Stack

- **Runtime**: Bun
- **UI**: OpenTUI React — load the `opentui` skill for full component/API reference
- **Database**: MongoDB Node.js driver (`mongodb` package)
- **State**: `useReducer` in `src/state.ts` — all app actions live here
