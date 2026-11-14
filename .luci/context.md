# Project Context: luci-monorepo

_Sections marked (auto-detected) come from the project's files and are refreshed by `luci update`. Change a heading to (confirmed) once a person has checked it, and it is kept as written. Replace every "Not written yet" with real information, or delete the section._

## Project Goal
Luci: a local-first toolkit for AI coding agents with memory, skill selection, design capture and feedback. Full requirements in docs/PRD.md.

## Stack (auto-detected)
- Framework: monorepo
- Languages: TypeScript
- Package manager: pnpm
- UI libraries: none detected
- Testing: vitest
- Packages (9; each has its own stack, so work in the one the task is about):
  - `packages/brain` (@luci/brain): library
  - `packages/capture` (@luci/capture): library, preact
  - `packages/cli` (luci): command line
  - `packages/extension` (@luci/extension): browser extension
  - `packages/feedback` (@luci/feedback): library, preact
  - `packages/format` (@luci/format): library
  - `packages/mcp` (@luci/mcp): MCP server
  - `packages/skills` (@luci/skills): library
  - `packages/toolbar` (@luci/toolbar): library

## Commands (auto-detected)
- Dev: not found
- Build: `pnpm build`
- Test: `pnpm test`
- Lint: not found
- Type check: `pnpm typecheck`

## Folder Map (auto-detected)
- `docs/`: documentation
- `eval/`
- `packages/`: workspace packages
- `scripts/`: scripts and tooling

## Architecture Notes
_Not written yet: the main parts, how data flows between them, external services._

## Conventions
_Not written yet: naming, file layout, error handling, patterns new code should copy._

## Definition of Done
- The change does what was asked, and nothing else.
- `pnpm test` passes.
- New or changed behavior has a test.
- No new lint or type errors.
