# M5.1: component files and the basket export (scope collection) are defined in @luci/format/capture, with golden files as the spec

- Date: 2026-11-12
- Status: accepted
- Area: Format

## What
M5.1: component files and the basket export (scope collection) are defined in @luci/format/capture, with golden files as the spec

## Why
Component: Tokens, Anatomy (parts named from tag, role and structure, container first, no browser defaults), States (hover, focus, focus-visible, active, disabled; each change "before -> after"; every state says how it was read: forced via the debugger, stylesheet rules, the disabled attribute, or by hand; a state with nothing readable is "Not detected" and never guessed), Motion, and Variants only for the whole-system output. Collection: frontmatter with item count and every source page (query dropped), items grouped Components, Text, Colours, Spacing, Systems, each with its own source, its sections one heading level down. Colours inside compound values (outline, shadows) follow the colour setting. Goldens: component-inputs.json and collection-inputs.json via scripts/capture-goldens.mjs, reviewed by eye; spec in docs/format/capture.md.

## Alternatives considered
_Not recorded._
