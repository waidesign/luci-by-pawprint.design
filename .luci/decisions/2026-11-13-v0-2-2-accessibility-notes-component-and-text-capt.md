# v0.2.2 accessibility notes: component and text captures get an Accessibility section (schema field accessibility { contrast[], target?, focus? }). Contrast is WCAG 2.2 relative luminance of the text color on the background behind it (element and ancestor background-colors layered over a white canvas; snapshot elements now carry a parent id), rounded down to 2 decimals, AA/AAA by size (large = 24px or 18.66px bold); estimated when a background-image or opacity is on the way. Target size (24px AA, 44px AAA) and focus visible only for interactive containers; focus is visible when the focus-visible (else focus) state changes outline, box-shadow, border, background, color or text-decoration; No when forced and nothing changed; null (Unknown) when only stylesheet rules were read.

- Date: 2026-11-13
- Status: accepted
- Area: capture

## What
v0.2.2 accessibility notes: component and text captures get an Accessibility section (schema field accessibility { contrast[], target?, focus? }). Contrast is WCAG 2.2 relative luminance of the text color on the background behind it (element and ancestor background-colors layered over a white canvas; snapshot elements now carry a parent id), rounded down to 2 decimals, AA/AAA by size (large = 24px or 18.66px bold); estimated when a background-image or opacity is on the way. Target size (24px AA, 44px AAA) and focus visible only for interactive containers; focus is visible when the focus-visible (else focus) state changes outline, box-shadow, border, background, color or text-decoration; No when forced and nothing changed; null (Unknown) when only stylesheet rules were read.

## Why
PRD v0.2 and feature idea 4. Computed from the snapshot so it matches what the page shows; site goldens and format goldens updated and reviewed.

## Alternatives considered
_Not recorded._
