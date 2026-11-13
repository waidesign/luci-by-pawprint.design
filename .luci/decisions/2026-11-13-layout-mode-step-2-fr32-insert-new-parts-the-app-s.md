# Layout mode step 2 (FR32): Insert new parts (the app's own components found on the page from React fibers, saved captures from .luci/design/ via luci serve GET /design, or 10 generic blocks), placed before/after/inside an element; previewed as placeholders Luci draws in its shadow root (never in the app DOM), siblings shifted with translate and a top-to-bottom parent grown with bottom padding, measured deepest parent first; new layout change op insert { what: { kind, name, file, example }, position before-after-start-end, width, height (px as rendered or 100%), label }.

- Date: 2026-11-13
- Status: accepted
- Area: feedback

## What
Layout mode step 2 (FR32): Insert new parts (the app's own components found on the page from React fibers, saved captures from .luci/design/ via luci serve GET /design, or 10 generic blocks), placed before/after/inside an element; previewed as placeholders Luci draws in its shadow root (never in the app DOM), siblings shifted with translate and a top-to-bottom parent grown with bottom padding, measured deepest parent first; new layout change op insert { what: { kind, name, file, example }, position before|after|start|end, width, height (px as rendered or 100%), label }.

## Why
User said go for Layout steps 2 and 3 (planned in active-task.md, format change approved). Components are found by the fiber parent chain (client) and the owner chain (server components); counted per instance, most used first, smaller parts before the page shell. A real DOM insert was rejected: it breaks the rule that Luci never changes the app DOM.

## Alternatives considered
_Not recorded._
