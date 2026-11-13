# Two format additions, approved by the user: a spacing token can list every value of one element (Spacing "All", the default), and a new page scope holds a full-page reference

- Date: 2026-11-13
- Status: accepted
- Area: Capture format

## What
Two format additions, approved by the user: a spacing token can list every value of one element (Spacing "All", the default), and a new page scope holds a full-page reference

## Why
User request 2026-11-13. Spacing: spacingSetSchema (scope token, type spacing, values[] of padding/margin/gap with property, usedBy); same sections as a single spacing token, one table row per value; file spacing-<tag>. Page: pageSchema (scope page, type page, no selector), sections Typography, Colors, Spacing (the three systems, headings one level down, a note when the page has none) and Components (one ### entry per kind of component, at most 16: button, link, field, navigation, header, footer, form, dialog, table, card, badge; first element of each tag and type in page order; cards larger than half the page are skipped as wrappers; each with tokens, anatomy, motion, variants, and only the states found from stylesheet rules and the disabled attribute, since a page file has no capture by hand). File <site>.page.<path-name>.design.md ("home" for /). Basket exports put pages in a new last group, Pages; every heading in an item moves one level down. The user chose these shapes over a collection of single spacing tokens and over Google's DESIGN.md format.

## Alternatives considered
_Not recorded._
