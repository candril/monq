---
description: Walk through a new release step by step
---

You are guiding the user through releasing a new version of monq. This is an interactive, step-by-step process. Do NOT rush ahead — complete each step, confirm with the user, then move to the next.

## Context

- Version control: jj (jujutsu), not git directly
- Build: `bun scripts/build.ts` (single platform) / `bun scripts/build.ts --all` (cross-compile)
- CI: GitHub Actions release workflow triggered by pushing a git tag `v*`
- Changelog: `CHANGELOG.md` follows Keep a Changelog format (https://keepachangelog.com)
- Repo: `candril/monq` on GitHub

## Step 1 — Determine the version

Read the current version from `package.json` and the latest section in `CHANGELOG.md`.

Show the user:
- Current version in package.json
- The latest released version in CHANGELOG.md (if any)
- Recent commits since the last release (use `jj log`)

Based on the commits, suggest a version bump (patch / minor / major) following semver. Ask the user to confirm or override the version number.

## Step 2 — Draft release notes

Gather all commits since the last release tag. Group them by type:
- **Added** — `feat:` commits
- **Fixed** — `fix:` commits
- **Changed** — `refactor:`, `perf:` commits
- **Other** — anything else notable (skip chore/docs/test unless significant)

Draft a CHANGELOG.md entry in Keep a Changelog format:

```
## [X.Y.Z] - YYYY-MM-DD

### Added
- ...

### Fixed
- ...

### Changed
- ...
```

Present the draft to the user. Ask them to review and suggest edits. Iterate until they approve.

## Step 3 — Apply the version bump

Once the user approves the release notes:

1. Update the `## [Unreleased]` section in `CHANGELOG.md` — move its contents into the new version section, leaving `## [Unreleased]` empty above it
2. Update `version` in `package.json` to the new version
3. Show the user a summary of changes with `jj diff`

Ask the user to confirm everything looks right.

## Step 4 — Commit and tag

1. Describe the current jj change: `jj describe -m "release: vX.Y.Z"`
2. Show the final state with `jj log --limit 3`

Ask the user if they want to push now or do it themselves later.

## Step 5 — Push and tag

If the user wants to push:

1. Push the bookmark to origin: `jj git push`
2. Create and push the git tag:
   ```
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

Tell the user:
- The tag push will trigger the GitHub Actions release workflow
- It will build binaries for all platforms, generate checksums, and create a GitHub Release
- Link them to the Actions tab: https://github.com/candril/monq/actions

## Step 6 — Post-release

After tagging:

1. Create a fresh jj change for the next development cycle: `jj new -m "chore: begin next development cycle"`
2. Remind the user to check the GitHub Release once CI completes and edit the release description if needed

## Rules

- Always ask before making changes. Never silently bump versions or push.
- If CHANGELOG.md doesn't exist yet, offer to create it.
- If the release workflow doesn't exist yet, warn the user that pushing a tag won't do anything until CI is set up.
- Keep the tone concise and practical. No fluff.
