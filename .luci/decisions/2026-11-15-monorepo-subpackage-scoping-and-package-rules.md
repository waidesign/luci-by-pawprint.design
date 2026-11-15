# Monorepo sub-package scoping and package rules (B16)

- Date: 2026-11-15
- Status: accepted
- Area: brain, cli, mcp

## What
Monorepo sub-package scoping and package rules (B16):
1. `findProjectRoot` walks up directory ancestors from any sub-package or sub-directory to locate the project root containing `.luci/`. In monorepos, project memory lives exclusively in the root `.luci/`.
2. Package-scoped rules are authored in the root `.luci/rules.md` under headings `## Package: <path-or-name>` or `## Package Rules: <path-or-name>` (e.g. `## Package: packages/cli` or `## Package: @luci/cli`).
3. `loadProjectContext` and MCP `get_project_context` detect `activePackage` from the sub-package path, attach package rules to each `WorkspacePackage`, and return all package rules as `packageRules`.
4. `luci start` inside a package shows the active package (`Package: <path> (<name>) — <kind>, <framework>`) and its rules (`Package rules (<n>): ...`); at the monorepo root, it lists all packages with their stack and rule counts.
5. `luci doctor` identifies the active package and reports package rules count in its summary.
6. CLI commands (`task`, `skills`, `capture`, `map`, `serve`) resolve root `.luci/` via `findProjectRoot` so they operate transparently from any package directory.
7. Rule conflict detection (`findRuleConflicts`) scopes rules by package, avoiding false conflicts when different packages define differing conventions.

## Why
When working inside a monorepo package (e.g. `packages/cli` or `apps/web`), agents and developers need access to root project memory without having duplicate `.luci/` directories, while having rules and stack information scoped to the active package they are developing in.

## Alternatives considered
- Creating nested `.luci/` folders in every package: rejected because project decisions, skills, feedback, design captures and task tracking should remain centralized at the repository root.
