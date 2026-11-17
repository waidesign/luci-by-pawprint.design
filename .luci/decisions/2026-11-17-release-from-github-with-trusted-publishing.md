# 2026-11-17: Release from GitHub with npm Trusted Publishing

- Date: 2026-11-17
- Status: accepted

## What
Luci is released with **Actions → Release → Run workflow** (a version, optionally a dry run). A macOS job sets the version, runs `pnpm check` and packs the 9 public packages; after the owner approves in the `npm-publish` environment, an Ubuntu job publishes those exact tarballs with npm Trusted Publishing (OIDC, provenance), commits the version, tags `vX.Y.Z` and creates the GitHub Release. CI runs `pnpm check` on every push and pull request to `main`.

## Why
Publishing 0.5.6 from the Mac needed a token that bypasses two-factor authentication; npm stops accepting those for direct publishing in January 2027, and a token on a laptop can publish a harmful Luci that `npx @luci-dev/cli@latest` users would run. Trusted Publishing needs no token, and the approval step keeps a person in the loop.

## Details
- `scripts/release.mjs` packs with pnpm (resolves `workspace:*`) and publishes dependencies first, skipping versions already on npm, so a failed run is finished by running it again. Pre-releases go out under the `next` tag.
- `scripts/bump-version.mjs` now requires a valid version (it used to fall back to 0.5.3) and also sets `LUCI_VERSION`.
- Tests made machine-independent for CI: golden capture files keep a target's AA/AAA row but not its font-dependent pixel size; the prototype-import test uses a unique marker instead of the word "old".
- CI and the release check run on macOS, where the golden files match.

## Alternatives considered
- Publishing on a pushed tag: the owner works on GitHub, so a button with a version box is simpler.
- Publishing without approval: the approval click does what two-factor authentication did.
- Linux for the test job: the golden files' fonts (Arial, Georgia, Menlo) are not installed there by default.
