# Use pnpm workspaces

- Date: 2026-11-12
- Status: accepted
- Area: Architecture

## What
Use pnpm workspaces

## Why
One install links every package, and the lockfile is shared.

## Alternatives considered
- npm workspaces: slower installs, no strict dependency isolation.
- Separate repositories: every change to the format package would need a release.
