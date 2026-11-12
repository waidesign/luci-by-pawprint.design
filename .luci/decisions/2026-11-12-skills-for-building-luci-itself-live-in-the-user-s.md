# Skills for building Luci itself live in the user's personal library (~/.luci/skills), not in Luci's official library

- Date: 2026-11-12
- Status: accepted
- Area: Skills

## What
Skills for building Luci itself live in the user's personal library (~/.luci/skills), not in Luci's official library

## Why
The user wants git-guardrails-claude-code, mcp-builder, setup-ts-deep-modules and writing-for-agents to keep helping build Luci. They are development tools, not product: the official library stays design-focused and licence-checked, and the personal library is never shipped or committed. They are added from the prototype's copies with `luci skills add <folder>` (no network). Adding them showed a bug: a prototype-format skill folder lost its contract (author, keywords, whenToUse) and kept the old contract file and keys; `skills add` now converts such a folder with the import code first. git-guardrails-claude-code is only added; its hook setup runs only if the user chooses.

## Alternatives considered
_Not recorded._
