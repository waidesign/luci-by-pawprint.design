# PRD Part 4 build rules in every session

- What happened: The build rules from docs/PRD.md Part 4 are recorded in `decisions/2026-11-12-build-rules-from-prd-part-4.md`, but `get_project_context` returns only `rules.md`, not `decisions/`. Agents would not see the rules at session start unless they open the PRD.
- Proposed: Add these lines under "Project-Specific Rules" (the existing four lines already cover following the PRD, waiting for approval, the read-only prototype and local commits):
  - Start a milestone only when the previous one meets its "Done when" line and every test passes.
  - Port, don't rewrite: move code with its tests, convert both to strict TypeScript, apply the PRD renames; change behaviour only where a requirement says so.
  - After any change to the skills package, run the benchmark; hit rate must stay at or above 0.966 (36 tuning cases) and 0.941 (22 held-out cases).
  - No network calls, telemetry, accounts or cloud storage; no new runtime dependency without a stated reason.
  - Don't copy a skill into the library unless its licence allows redistribution.
  - Product code, files and output use Luci names only; only the import command (B13) reads the old layout.
  - Ask before deleting files, changing a format schema or changing a requirement.
- Belongs in: rules.md
