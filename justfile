# Default recipe - show available commands
default:
    @just --list

# Run the TUI application
run uri:
    bun src/index.tsx --uri "{{uri}}"

# Run with hot reload (watches for changes)
dev uri:
    bun --watch src/index.tsx --uri "{{uri}}"

# Install dependencies
install:
    bun install

# Add a new dependency
add package:
    bun add {{package}}

# Add a dev dependency
add-dev package:
    bun add -d {{package}}

# Remove a dependency
remove package:
    bun remove {{package}}

# Update all dependencies
update:
    bun update

# Run tests
test:
    bun test

# Run tests in watch mode
test-watch:
    bun test --watch

# Type check without emitting (using tsgo — native Go port of TypeScript, ~10x faster)
typecheck:
    bunx tsgo --noEmit

# Run all checks: typecheck + lint + fmt
check:
    just typecheck
    just lint
    just fmt-check

# Lint source files
lint:
    bun run lint

# Lint and auto-fix
lint-fix:
    bun run lint:fix

# Format source files
fmt:
    bun run fmt

# Check formatting without writing
fmt-check:
    bun run fmt:check

# Build standalone binary for current platform
build:
    bun scripts/build.ts

# Build standalone binaries for all platforms
build-all:
    bun scripts/build.ts --all

# Clean node_modules and reinstall
clean:
    rm -rf node_modules bun.lock && bun install

# Show outdated dependencies
outdated:
    bun outdated
