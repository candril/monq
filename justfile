# Default recipe - show available commands
default:
    @just --list

# Run the TUI application (uri optional)
run uri="":
    bun src/index.tsx {{ if uri != "" { '--uri "' + uri + '"' } else { "" } }}

# Run with hot reload (uri optional)
dev uri="":
    bun --watch src/index.tsx {{ if uri != "" { '--uri "' + uri + '"' } else { "" } }}

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

# Run the documentation site locally
site-dev:
    cd site && bun run dev

# Build the documentation site
site-build:
    cd site && bun run build

# Build and install the binary to ~/.local/bin
#
# `install` replaces the inode deliberately: copying over the existing file keeps it, and
# macOS kills a running binary whose cached code signature no longer matches — silently,
# exit 137.
install-bin: build
    mkdir -p ~/.local/bin
    install -m 755 dist/monq ~/.local/bin/monq
    @~/.local/bin/monq --version >/dev/null || (echo "installed binary does not run" && exit 1)
    @echo "installed: ~/.local/bin/monq $(~/.local/bin/monq --version)"

# Tag a release: just release 0.6.0 (pushing the tag is what builds and publishes it)
#
# The tag is the version a released binary reports, so package.json and CHANGELOG.md are
# checked against it here rather than after four runners have built the wrong number.
# jj cannot create git tags, hence plain `git tag` against the colocated repo.
release version:
    @grep -q '"version": "{{version}}"' package.json || (echo "package.json is not {{version}}" && exit 1)
    @grep -q '^## \[{{version}}\]' CHANGELOG.md || (echo "CHANGELOG.md has no [{{version}}] section" && exit 1)
    @test -z "$(jj diff --name-only)" || (echo "working copy has uncommitted changes" && exit 1)
    just check
    just test
    git tag v{{version}}
    @echo "tagged v{{version}} at $(git rev-parse --short HEAD)"
    @echo "publish it with: git push origin v{{version}}"
