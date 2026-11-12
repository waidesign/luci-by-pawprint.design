# Build rules from PRD Part 4

- Date: 2026-11-12
- Status: accepted
- Area: Process

## What
Build rules from PRD Part 4

## Why
Source: docs/PRD.md Part 4, How to use this document. These apply to all build work.

1. Work in milestone order, M1 to M6. Do not start a milestone until the previous one meets its "Done when" line and every test passes.
2. Port, do not rewrite. For a module marked Port, move the code and its tests, convert both to strict TypeScript, and apply the renames. Change behaviour only where a requirement says so.
3. Protect selection quality. After any change to the skills package, run the benchmark. Scores must not fall below the prototype baseline: hit rate 0.966 on the 36 tuning cases and 0.941 on the 22 held-out cases.
4. Keep it local. No network calls, telemetry, accounts or cloud storage. No new runtime dependency without a stated reason.
5. Respect licences. Do not copy a skill into the library unless its licence allows redistribution.
6. Use the new names only. Product code, files and output never mention the prototype name. The import command (B13) is the one place that reads the old layout.
7. Ask first before deleting files, changing a format schema, or changing a requirement.
8. Record decisions in project memory as they are made.

Renames: gaw command -> luci; ai-brain/ -> .luci/; ~/.gaw/ -> ~/.luci/; GAW_HOME -> LUCI_HOME; gaw.json -> luci.json; GAW Skill Standard (GSS) -> Luci Skill Standard (LSS); guided-agent-workflow-mcp -> luci-mcp; guided-agent-workflow package -> luci (if free on npm).

Project setup (12 Nov 2026): local git only, commit after each finished task, never push. Prototype source at E:/gaw-guided-agent-workflow (commit 5276a50) is read-only.

## Alternatives considered
_Not recorded._
