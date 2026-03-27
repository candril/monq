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

# Type check without emitting
typecheck:
    bun x tsc --noEmit

# Build standalone binary
build:
    bun build src/index.tsx --compile --outfile dist/monq

# Clean node_modules and reinstall
clean:
    rm -rf node_modules bun.lock && bun install

# Show outdated dependencies
outdated:
    bun outdated
