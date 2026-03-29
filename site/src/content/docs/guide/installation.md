---
title: Installation
description: How to install monq on your system.
---

## Prerequisites

- [Bun](https://bun.sh) — monq uses Bun as its runtime and build tool
- [just](https://github.com/casey/just) — used to run the build recipe

Install Bun if you don't have it:

```sh
curl -fsSL https://bun.sh/install | bash
```

## Build from source

Clone the repository and build the binary:

```sh
git clone https://github.com/candril/monq
cd monq
bun install
just build
```

This produces a self-contained binary at `dist/monq`.

## Add to PATH

Move or symlink the binary to somewhere on your `$PATH`:

```sh
# Option 1: copy to a directory already on your PATH
cp dist/monq /usr/local/bin/monq

# Option 2: symlink
ln -s "$(pwd)/dist/monq" /usr/local/bin/monq
```

Verify the installation:

```sh
monq --help
```

## Run without installing

You can run monq directly with Bun without building a binary:

```sh
bun src/index.tsx --uri mongodb://localhost:27017/mydb
```

## Next steps

- [Usage](/monq/guide/usage/) — connect to a database and start exploring
