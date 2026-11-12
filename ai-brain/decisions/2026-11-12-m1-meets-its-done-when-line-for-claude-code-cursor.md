# M1 meets its Done when line for Claude Code; Cursor check is manual

- Date: 2026-11-12
- Status: accepted
- Area: Process

## What
M1 meets its Done when line for Claude Code; Cursor check is manual

## Why
2026-11-12. pnpm check passes from a clean build (format, brain and cli; 89 tests, strict typecheck of sources and tests). luci init -i on a fresh copy of the sample React project wrote .luci/, the Global Brain summary, CLAUDE.md and .cursorrules, and luci doctor reported no problems. Claude Code (claude -p, Read tool only, throwaway LUCI_HOME) was asked for the project's goal and rules without naming any file, and answered with the goal from .luci/context.md and the project rule from .luci/rules.md, naming both files. Still to do by a person: the same check in Cursor. M2 must not start until the user approves.

## Alternatives considered
_Not recorded._
