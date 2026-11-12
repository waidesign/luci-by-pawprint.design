# M1 port scope decisions

- Date: 2026-11-12
- Status: accepted
- Area: Architecture

## What
M1 port scope decisions

## Why
Approved with the M1 plan on 2026-11-12 (the user said go to the recommended options).

- Cursor: keep writing .cursorrules in M1 (port, do not rewrite); revisit .cursor/rules/ later.
- Not ported: ProjectAnalyzer, DependencyManager, ensureGitignored and MemoryEngine.getHierarchicalContext. Nothing in the prototype calls them, so behaviour does not change.
- B14 project design baseline (design.md) moves to M4/M5, when Luci's design format exists. M1 init does not write design.md.
- Doctor (B5) is written new: the prototype's doctor marks every line as passed and never checks the project setup.
- Also ported although missing from the source map: core/utils/markdownSections, core/utils/readJson, core/product.
- In M1 the brain package does not depend on skills: skills, packs and the skill catalogue join project context in M2.
- The Luci memory layout starts at layout 1; the prototype's layouts are read only by the import command (B13).

## Alternatives considered
_Not recorded._
