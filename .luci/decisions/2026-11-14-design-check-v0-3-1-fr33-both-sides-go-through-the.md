# Design check (v0.3.1, FR33): both sides go through the component file. The built component is captured like the Component tool does (states included), written in px and hex, and read back with readComponentFile, the same reader as the design file; checkComponent compares the two by meaning (px within 0.5, colorKey, ms, functions by argument, first font), part by part, states, motion and accessibility levels that got worse. Each difference is one sentence; in the dev toolbar the ticked ones become Feedback notes (intent fix, new optional item field `check`: design, part, state, property, expected, actual), in the extension they are copied as a prompt. luci serve gained GET /design/<file> to read one saved design.

- Date: 2026-11-14
- Status: accepted
- Area: architecture

## What
Design check (v0.3.1, FR33): both sides go through the component file. The built component is captured like the Component tool does (states included), written in px and hex, and read back with readComponentFile, the same reader as the design file; checkComponent compares the two by meaning (px within 0.5, colorKey, ms, functions by argument, first font), part by part, states, motion and accessibility levels that got worse. Each difference is one sentence; in the dev toolbar the ticked ones become Feedback notes (intent fix, new optional item field `check`: design, part, state, property, expected, actual), in the extension they are copied as a prompt. luci serve gained GET /design/<file> to read one saved design.

## Why
Comparing text forms written by one formatter keeps the check independent of the design file's unit and color settings (tested through rem, both, rgb, hsl and oklch) and of how values were read; a token difference is raised only when the built page defines the design's token, so designs taken from other sites do not flood the result. Extra properties, extra parts and a missing optional part are low priority; accessibility that got worse is high. Done when checked: packages/toolbar/test/check.test.ts gives exactly 3 notes for the fixture site "check" and the agent prompt lists them.

## Alternatives considered
_Not recorded._
