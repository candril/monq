# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-04-02

### Added
- Export query results as JSON or CSV
- Eager explain refresh on query change
- Animated loading spinner across all columns
- `--version` flag; version shown on connection screens (git hash in dev mode)

### Fixed
- Pipeline state is saved/restored per tab; watcher restarts on tab switch
- Preview panel now shows relaxed EJSON format matching the editor
- Command palette "Edit Document" uses the same code path as the `e` key
- Checksum verification uses `shasum` unconditionally on macOS
- Release workflow uses native runners for each build target

## [0.1.0] - 2026-04-01

### Added
- Terminal-based MongoDB browser and query tool with a keyboard-first interface.
