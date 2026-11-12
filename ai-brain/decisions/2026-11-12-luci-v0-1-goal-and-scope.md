# Luci v0.1 goal and scope

- Date: 2026-11-12
- Status: accepted
- Area: Product

## What
Luci v0.1 goal and scope

## Why
Source: docs/PRD.md Part 1, Goals and non-goals.

One local-first toolkit giving AI coding agents project memory (Brain), task-fitting skills (Skills), exact design context (Capture) and precise feedback (Feedback), all sharing one project memory folder.

v0.1 goals:
1. One install and one command set up a project for every supported agent.
2. Agents start each session with project memory and personal preferences, without being told again.
3. Only skills that fit the task load, each with a stated reason; nothing loads when nothing fits.
4. Pick a component, text, colour or spacing on a live page and get a scoped design.md in under 10 seconds, as one item or the page-wide system.
5. Every captured value is measured from the live DOM, including hover, focus, active and disabled states.
6. Several picks collect in a basket and export as one file; images cannot be captured.
7. Feedback from several pages reaches the agent as one prompt and is applied in full (React first).
8. Captures and feedback are saved into project memory, so every agent sees them without copy and paste.
9. Everything runs locally: no backend, no account, no API key.

Non-goals for v0.1: whole-site crawling, code export or pixel-perfect cloning, copying site text/images/brand assets, Figma export, browsers other than Chrome, AI-written prose in captured files, cloud sync or team accounts.

## Alternatives considered
_Not recorded._
