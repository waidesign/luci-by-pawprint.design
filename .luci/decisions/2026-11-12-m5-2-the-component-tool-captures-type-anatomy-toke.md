# M5.2: the Component tool captures type, anatomy, tokens, motion and (whole system) variants from the page snapshot

- Date: 2026-11-12
- Status: accepted
- Area: Capture

## What
M5.2: the Component tool captures type, anatomy, tokens, motion and (whole system) variants from the page snapshot

## Why
packages/capture/src/component.ts. Type from tag, role and look (a link with a background or border is a button; a filled or shadowed box is a card, or a badge when short and text-bearing). Anatomy: the container's box styles, then parts (label, heading, description, icon, image, field, action, link, list, item, code) up to 3 levels deep, named from tag and role; only properties the site declared are kept, so browser defaults drop out (when a stylesheet cannot be read, values that are not the initial value are kept instead). Padding and borders become shorthands, with authored values kept even when sides differ ("var(--space-3) var(--space-6)"). Tokens: every var() a part uses, resolved from :root. Motion: transitions with a duration, and animations. Variants: visible elements of the same tag and type, grouped by look, picked group first, with differences. The DOM reader now also records width, height, flex alignment, radius, shadow, cursor, outline offset, text-align, transitions and animations, a "declared" flag per property, and whether every sheet was readable. Checked on the five sites against getComputedStyle; states come next (M5.3).

## Alternatives considered
_Not recorded._
