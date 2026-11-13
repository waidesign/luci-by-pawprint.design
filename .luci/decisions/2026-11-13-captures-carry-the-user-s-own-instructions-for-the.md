# Captures carry the user's own instructions for their agent, word for word, and can be edited by hand; no AI inside Luci

- Date: 2026-11-13
- Status: accepted
- Area: Capture

## What
Captures carry the user's own instructions for their agent, word for word, and can be edited by hand; no AI inside Luci

## Why
User request on 2026-11-13: a prompt box to say how to use or change a captured design.md. A built-in AI rewrite would break the PRD decisions "no AI inside the product in v0.1" and "no API key, no cloud", so the user chose (asked with options) "notes for the agent" plus "edit the file directly". Format: an optional `instructions` field on every capture schema, written as the first section "## Your instructions" after the frontmatter (lines starting with "#" escaped); withInstructions() sets, replaces or removes that section in edited text; basket items may carry `edited` text that single and collection exports use. Toolbar: an instructions box under every capture, an editable preview (textarea) whose edits survive unit/color setting changes and instruction changes, "Undo my edits", and copy, download and Add to basket use exactly the shown text. Key events typed in Luci's own fields no longer reach the page. Also fixed two extension tests: the test server now closes open connections (the basket test hung on close), and the test-only build has access to all sites because captureVisibleTab needs activeTab or that.

## Alternatives considered
_Not recorded._
