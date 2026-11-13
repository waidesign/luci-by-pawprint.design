# The dev toolbar (M6) is one script, served by `luci serve` at /toolbar.js, with two modes: Feedback (own Preact layer in packages/feedback) and Capture (the extension toolbar, plus Save to project). Feedback items are one JSON file each in .luci/feedback/ (luci serve and luci-mcp both write; atomic renames), with stable IDs P<page>-A<n>. Without luci serve, notes stay in browser storage and the badge says why and reconnects on a click. The React adapter reads fibers (owner chain, _debugStack or _debugSource) and the dev server source maps for exact JSX lines; React is never imported.

- Date: 2026-11-13
- Status: accepted
- Area: feedback

## What
The dev toolbar (M6) is one script, served by `luci serve` at /toolbar.js, with two modes: Feedback (own Preact layer in packages/feedback) and Capture (the extension toolbar, plus Save to project). Feedback items are one JSON file each in .luci/feedback/ (luci serve and luci-mcp both write; atomic renames), with stable IDs P<page>-A<n>. Without luci serve, notes stay in browser storage and the badge says why and reconnects on a click. The React adapter reads fibers (owner chain, _debugStack or _debugSource) and the dev server source maps for exact JSX lines; React is never imported.

## Why
User chose the `luci serve` bridge and dev-only React 19 on 2026-11-13. luci serve binds 127.0.0.1, checks Host (DNS rebinding), allows only loopback origins, and needs JSON plus the X-Luci header to write. Pause animations and webhook send (FR31) are in the Feedback layer; the webhook posts only when the person presses Send.

## Alternatives considered
_Not recorded._
