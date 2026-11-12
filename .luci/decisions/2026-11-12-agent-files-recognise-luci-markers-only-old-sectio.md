# Agent files recognise Luci markers only; old sections are the import command's job

- Date: 2026-11-12
- Status: accepted
- Area: Agents

## What
Agent files recognise Luci markers only; old sections are the import command's job

## Why
Luci writes its section between <!-- LUCI — <AGENT> CONFIGURATION --> and <!-- END LUCI --> in CLAUDE.md and .cursorrules (M1; the other agents follow in v0.2). The prototype also recognised its own two older marker names and replaced them in place. Rule 6 keeps the prototype's names out of product code except the import command (B13, M3), so luci init on a project set up with the prototype adds a Luci section above the old one. B13 must remove or convert the old sections, and Luci's own project should move with luci import, not luci init. The block drops the skills and MCP lines until M2 and M3 provide them.

## Alternatives considered
_Not recorded._
