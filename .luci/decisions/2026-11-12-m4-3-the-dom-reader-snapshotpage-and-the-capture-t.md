# M4.3: the DOM reader (snapshotPage) and the capture tools run in real Chromium on five local test sites, one per styling approach, as part of pnpm check

- Date: 2026-11-12
- Status: accepted
- Area: Capture

## What
M4.3: the DOM reader (snapshotPage) and the capture tools run in real Chromium on five local test sites, one per styling approach, as part of pnpm check

## Why
snapshotPage reads getComputedStyle, a structural selector (tags and nth-of-type, never hashed classes; "host >> inner" into open shadow roots), and authored values from the stylesheet rules that match each element (cascade by !important, inline, specificity, order; shorthands for padding/margin/gap/border; inherited values from ancestors; :host rules; adopted sheets). Box properties with no declaration are browser defaults. Sites: utility classes, CSS-in-JS (insertRule, hashed classes), CSS Modules (linked sheet, rem/em, shorthands), web components (shadow roots, adopted sheet, slots), plain CSS variables (clamp). They are served from 127.0.0.1 only. Checks per site: eligibility, every text style once, h1 values equal getComputedStyle for the element its selector finds, every visible colour use has a role, the base unit, and golden files in packages/capture/fixtures/expected/. Dev tools added: playwright 1.64.1 (1.65.0 was under two weeks old) and esbuild 0.28.2 (bundles the capture code for the pages; its install script is denied in pnpm-workspace.yaml, the binary works without it). Bugs found by the sites and fixed: SVG root fill, zero-height line shapes, border colours from the border shorthand, slotted text styled by its slot, "where used" kept the last selector; the base unit now uses a 0.25px tolerance and a 75% share, and the web-components fixture was made an unambiguous 8px system.

## Alternatives considered
_Not recorded._
