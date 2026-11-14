# Conflict detection (v0.3.5, B12): compare .luci/rules.md against ~/.luci/brain/*.md (and within rules.md) using two deterministic layers — known mutually exclusive pairs/groups (indentation, quotes, semicolons, package manager, exports, modules, components) and opposite polarity statements on the same normalized subject tokens — surfaced as warnings in luci doctor and get_project_context with both files, line numbers, quotes and precedence.

- Date: 2026-11-14
- Status: accepted
- Area: architecture

## What
Conflict detection (v0.3.5, B12): compare .luci/rules.md against ~/.luci/brain/*.md (and within rules.md) using two deterministic layers — known mutually exclusive pairs/groups (indentation, quotes, semicolons, package manager, exports, modules, components) and opposite polarity statements on the same normalized subject tokens — surfaced as warnings in luci doctor and get_project_context with both files, line numbers, quotes and precedence.

## Why
Agents read both Global Brain preferences and project rules every session. Contradictions between them (or inside rules.md) are allowed when a project overrides a personal preference, but only if the person knows they exist and which one wins. Deterministic clause-level polarity parsing (splitting contrastive clauses like instead of / rather than and skipping conditional exceptions like only when / only if) catches real contradictions without false positives on the default Global Brain.

## Alternatives considered
_Not recorded._
