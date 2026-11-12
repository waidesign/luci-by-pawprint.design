# Network only in explicit skill commands

- Date: 2026-11-12
- Status: accepted
- Area: Skills

## What
Network only in explicit skill commands

## Why
S9 (import from GitHub) and the source licence check need GitHub. Luci makes network requests only when the user runs luci skills add <github-link> or luci skills licenses, says so on screen, and never in the background. Everything else stays offline (Part 4 rule 4).

## Alternatives considered
_Not recorded._
