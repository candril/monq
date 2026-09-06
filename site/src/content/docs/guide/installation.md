---
title: Installation
description: Install monq and point it at a database.
---

## Install

Prebuilt binaries for macOS (Apple Silicon and Intel) and Linux (x64 and arm64), by any of three
routes. All three install the same binary: the one attached to the latest
[release](https://github.com/candril/monq/releases), verified against its `SHA256SUMS`.

### Homebrew

```sh
brew install candril/tap/monq
```

The tap is [candril/homebrew-tap](https://github.com/candril/homebrew-tap); `brew upgrade` picks
up new releases.

### Nix

```sh
nix run github:candril/monq                 # run it once
nix profile install github:candril/monq     # keep it
```

Or as a flake input — `inputs.monq.url = "github:candril/monq"`, then
`inputs.monq.packages.${system}.default`. The flake packages the release binary; the release
workflow writes its `release.json`, so `nix run` and `nix flake update` land on the newest release.

### Installer script

```sh
curl -fsSL https://raw.githubusercontent.com/candril/monq/main/scripts/install.sh | bash
```

The installer detects your platform, downloads the latest release, verifies its SHA256 against the
release's `SHA256SUMS`, and puts `monq` in `/usr/local/bin`. Two variables change that:

```sh
MONQ_INSTALL_DIR=~/.local/bin …   # somewhere else on your PATH
MONQ_VERSION=0.1.0 …              # a specific release
```

Or download `monq-<os>-<arch>.gz` from the releases page by hand, `gunzip` it, and put it on
your `PATH`.

### From source

monq is a [Bun](https://bun.sh) application, so a clone runs as it is:

```sh
git clone https://github.com/candril/monq.git
cd monq
bun install
bun src/index.tsx --uri mongodb://localhost:27017/mydb   # run from source
bun scripts/build.ts                                     # → dist/monq, a standalone binary
```

With [just](https://github.com/casey/just): `just build`, or `just install-bin` to build and
install it to `~/.local/bin`. `just dev` runs from source with hot reload.

## Requirements

- A MongoDB you can reach — `monq --uri mongodb://…`, or saved connection profiles in
  `~/.config/monq/config.toml` with `uri_cmd` for secrets from Vault, 1Password or the like.
- A terminal with truecolor and a decent Unicode set — WezTerm, Ghostty, kitty, iTerm2 and
  Alacritty are all fine.
- `$EDITOR` for document, pipeline and index editing; tmux for the split-pane editors.
- **[Bun](https://bun.sh)** 1.x only if you build from source.

## First run

```sh
monq --uri mongodb://localhost:27017/mydb
monq --uri mongodb://localhost:27017        # picks the database interactively
monq                                        # saved connections, or a URI prompt
```

Press `Ctrl+P` for the command palette, `q` to quit.

## Next steps

- [Usage](/monq/guide/usage/) — connect to a database and start exploring
