# M3.6 (B13): `luci import [--dry-run]` moves a prototype project (ai-brain/) onto Luci (.luci/), keeping everything a person wrote and deleting nothing

- Date: 2026-11-12
- Status: accepted
- Area: Memory

## What
M3.6 (B13): `luci import [--dry-run]` moves a prototype project (ai-brain/) onto Luci (.luci/), keeping everything a person wrote and deleting nothing

## Why
Memory files are merged into Luci's templates section by section: a section that matches Luci's template or the prototype's shipped template (placeholders as wildcards; the protected-paths list only as its three generated lines, so an added line is never matched away) gets Luci's text; edited sections are kept with old paths and commands renamed. Decisions and proposals are copied word for word. Skills: gaw.json to luci.json, gaw-* keys to luci-*; unchanged starters become Luci's copies. The lock is converted and skills missing from Luci's library are reported. The active task is copied with paths renamed; generated files are rebuilt. Global Brain files from ~/.gaw/brain carry over only when the user changed them and Luci's copy is missing or still a default. The prototype's agent sections (CLAUDE.md, .cursorrules, AGENTS.md, GEMINI.md, copilot) are replaced in place. ai-brain/ stays for the user to delete. To tell shipped text from user text, packages/brain/import-snapshot/ holds unchanged copies of the prototype's templates and Global Brain defaults (commit 5276a50); only import reads them, and a test checks that no other product code names the prototype.

## Alternatives considered
_Not recorded._
