# Capture to rule (v0.3.2, FR34): a saved component capture becomes a proposed rule for rules.md, not a project skill. One line points at .luci/design/<file> with the key container and text values (tokens named) and up to two changes per state; it is written to .luci/memory/proposed/ (the same rule again finds the waiting one) and the person moves it into rules.md. Entry points: dev toolbar "Make it a rule" (saves the capture, then luci serve POST /rule), `luci capture rule <file>` (and `luci capture` to list), MCP propose_capture_rule. The format holds the pure rule text (rule.ts), brain writes it (design/captureRule.ts).

- Date: 2026-11-14
- Status: accepted
- Area: architecture

## What
Capture to rule (v0.3.2, FR34): a saved component capture becomes a proposed rule for rules.md, not a project skill. One line points at .luci/design/<file> with the key container and text values (tokens named) and up to two changes per state; it is written to .luci/memory/proposed/ (the same rule again finds the waiting one) and the person moves it into rules.md. Entry points: dev toolbar "Make it a rule" (saves the capture, then luci serve POST /rule), `luci capture rule <file>` (and `luci capture` to list), MCP propose_capture_rule. The format holds the pure rule text (rule.ts), brain writes it (design/captureRule.ts).

## Why
The user asked for the best recommendation. Rules are read every session and rules.md stays short, so one pointer line per component fits; the capture file holds the detail. A skill loads only when a task asks for it, which suits a whole design system better: a later step. Luci never edits rules.md (project rule), so the proposal flow the person already reviews is reused. Also: the toolbar panel now scrolls when its content is taller than the window.

## Alternatives considered
_Not recorded._
