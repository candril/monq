#!/usr/bin/env bash
set -euo pipefail

# monq installer
# Usage: curl -fsSL https://raw.githubusercontent.com/candril/monq/main/scripts/install.sh | bash

REPO="candril/monq"
INSTALL_DIR="${MONQ_INSTALL_DIR:-/usr/local/bin}"
BINARY_NAME="monq"

# Detect OS
case "$(uname -s)" in
  Darwin) OS="darwin" ;;
  Linux)  OS="linux" ;;
  *)
    echo "Error: unsupported operating system $(uname -s)"
    exit 1
    ;;
esac

# Detect architecture
case "$(uname -m)" in
  x86_64|amd64)  ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *)
    echo "Error: unsupported architecture $(uname -m)"
    exit 1
    ;;
esac

ASSET="monq-${OS}-${ARCH}.gz"

echo "monq installer"
echo "  OS:      ${OS}"
echo "  Arch:    ${ARCH}"
echo "  Install: ${INSTALL_DIR}/${BINARY_NAME}"
echo

# Get latest release tag
if [ -n "${MONQ_VERSION:-}" ]; then
  TAG="v${MONQ_VERSION}"
  echo "Installing version ${TAG}..."
else
  TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')
  if [ -z "$TAG" ]; then
    echo "Error: could not determine latest release"
    exit 1
  fi
  echo "Latest release: ${TAG}"
fi

DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}"
CHECKSUM_URL="https://github.com/${REPO}/releases/download/${TAG}/SHA256SUMS"

# Download binary and checksums to temp dir
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT

echo "Downloading ${ASSET}..."
curl -fsSL -o "${TMP_DIR}/${ASSET}" "$DOWNLOAD_URL"

echo "Verifying checksum..."
curl -fsSL -o "${TMP_DIR}/SHA256SUMS" "$CHECKSUM_URL"

# Verify checksum
cd "$TMP_DIR"
if [ "$OS" = "darwin" ]; then
  grep "$ASSET" SHA256SUMS | shasum -a 256 -c --quiet
elif command -v sha256sum &> /dev/null; then
  grep "$ASSET" SHA256SUMS | sha256sum -c --quiet
elif command -v shasum &> /dev/null; then
  grep "$ASSET" SHA256SUMS | shasum -a 256 -c --quiet
else
  echo "Warning: no sha256sum or shasum found, skipping verification"
fi

# Decompress
echo "Installing..."
gunzip "$ASSET"
chmod +x "monq-${OS}-${ARCH}"

# Install
if [ -w "$INSTALL_DIR" ]; then
  mv "monq-${OS}-${ARCH}" "${INSTALL_DIR}/${BINARY_NAME}"
else
  sudo mv "monq-${OS}-${ARCH}" "${INSTALL_DIR}/${BINARY_NAME}"
fi

echo
echo "monq ${TAG} installed to ${INSTALL_DIR}/${BINARY_NAME}"
echo "Run 'monq --help' to get started."
