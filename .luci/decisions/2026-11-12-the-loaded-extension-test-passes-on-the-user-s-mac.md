# The loaded-extension test passes on the user's machine: M4 is fully verified

- Date: 2026-11-12
- Status: accepted
- Area: Milestone

## What
The loaded-extension test passes on the user's machine: M4 is fully verified

## Why
On 2026-11-12 the user ran `pnpm test:extension` in a normal terminal: 2 of 2 passed in 4.8s (the production manifest check, and the test build loaded in Chromium that puts the toolbar on a test site, captures with it, keeps settings and closes on a second click). So the start-up hang seen earlier happens only in the agent's sandbox. The test stays opt-in for that reason; run it with `pnpm test:extension` after extension changes. The user also tried the extension by hand in real Chrome (Text and Spacing worked; the Colour tool was reworked into an Element / Pixel switch after their feedback).

## Alternatives considered
_Not recorded._
