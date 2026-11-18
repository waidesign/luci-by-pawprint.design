# Codebase, stack and build tooling decisions

- Date: 2026-11-12
- Status: accepted
- Area: Architecture

## What
Codebase, stack and build tooling decisions

## Why
Source: .luci/docs/PRD.md Part 2, Decisions made on 12 Nov 2026.

- Codebase: a new repository; memory and skills are ported from the prototype with their tests, Capture and Feedback are new.
- Tech stack (approved): TypeScript pnpm monorepo, Preact toolbar in Shadow DOM, WXT Manifest V3 extension, MCP TypeScript SDK, Zod, culori, Vitest and Playwright. Node 18 or later.
- Build tooling: build Luci with the prototype; move onto Luci once M1 to M3 work.

## Alternatives considered
_Not recorded._
