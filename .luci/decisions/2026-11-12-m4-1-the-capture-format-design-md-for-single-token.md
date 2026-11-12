# M4.1: the capture format (design.md) for single tokens and page systems is defined in @luci/format/capture, with golden files as the spec

- Date: 2026-11-12
- Status: accepted
- Area: Format

## What
M4.1: the capture format (design.md) for single tokens and page systems is defined in @luci/format/capture, with golden files as the spec

## Why
Per PRD decision 3 the format comes before the extractors. Zod schemas cover token captures (text, color, spacing) and system captures (typography, color, spacing); every value keeps computed, authored and token (decision 6); file names are flat (decision 7); source drops query and fragment; elements are named from tag and role, never class names; no page text or image URLs (FR21). Settings: units px/rem/both, colours hex/rgb/hsl/oklch via culori 4.0.2 (named in the PRD stack). The capture subpath is browser-safe so the extension can import it. Golden files in packages/format/fixtures/capture/ come from inputs.json via scripts/capture-goldens.mjs and were reviewed by eye. Spec: docs/format/capture.md.

## Alternatives considered
_Not recorded._
