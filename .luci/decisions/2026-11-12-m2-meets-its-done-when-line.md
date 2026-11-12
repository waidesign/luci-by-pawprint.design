# M2 meets its Done when line

- Date: 2026-11-12
- Status: accepted
- Area: Process

## What
M2 meets its Done when line

## Why
2026-11-12. 'The selection benchmark meets its target': (1) port parity: on the prototype's own 212-skill library, Luci's engine reproduces the prototype baseline exactly (tuning hit rate 0.966, held-out 0.941, and the same precision, no-match accuracy and skill counts), re-run after the last M2 change; (2) on Luci's 38-skill design library, the re-scoped benchmark runs in the test suite and meets Luci's recorded baseline (tuning 0.929, held-out 0.8, no-match 0.864 / 0.941). pnpm check passes (178 tests). Delivered: S1 Luci Skill Standard (docs/format/skill-standard.md), S2 selection with reasons, S3 8,000-token budget, S4 search and recommend, S5 list/add/select/lint, S6 design library with verified licences, S7 benchmark, S8 packs, S9 import from GitHub with trust levels (network only in explicit commands), S10 ranking levels and draft review. Deferred: the active-task pointer (`use --inject`, B9) and MCP tools to M3; restoring missing support files for imported skills. Open for the user: whether motion-dev and animejs are their own (no public source found), and reviewing drafted keywords to raise selection quality.

## Alternatives considered
_Not recorded._
