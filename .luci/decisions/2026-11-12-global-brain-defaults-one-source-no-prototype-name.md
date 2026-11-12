# Global Brain defaults: one source, no prototype names

- Date: 2026-11-12
- Status: accepted
- Area: Memory

## What
Global Brain defaults: one source, no prototype names

## Why
The defaults ship in packages/brain/defaults (ported from the prototype's brain/ folder, with Agentation and gaw commands removed). The prototype also hard-coded a second, different copy of each file in MemoryEngine; Luci keeps only a README and an empty decision history as built-in fallbacks. The defaults folder's own README is no longer copied into the user's brain. init --dry-run no longer creates ~/.luci. Global decision rows have pipes and line breaks flattened so the table stays valid.

## Alternatives considered
_Not recorded._
