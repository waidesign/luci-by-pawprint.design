# 2026-11-14: The Luci brand kit becomes the design system (@luci/ui)

## Context
The user supplied the Luci brand kit (mascot, logos, tokens, DESIGN.md, BRAND.md, animations) and asked for the UI to follow it, replacing the interim Muzzle White / Pastel Red styling from 997e7ec..53f5ea6.

## Decisions
1. **The kit lives unchanged in `brand/`** (read-only). `pnpm brand:sync` (`scripts/brand-sync.mjs`) generates `packages/ui/src/tokens.{css,ts}` and `mascot/art.ts`, and copies icons, logos and tokens into `packages/extension/public/`. Tests check the generated files still match the kit.
2. **Role tokens** follow DESIGN.md section 2 as references to the kit palette; nothing else holds a colour. Dark theme (not fully specified by the kit) is built from the same palette: surface muzzle-900, raised and sunken muzzle-800 (a tint on Charcoal only reads when lighter), text muzzle-50, secondary muzzle-300, primary and accents ginger-400, link ginger-300. Every dark text pair passes 4.5:1.
3. **Compact surfaces**: the on-page panels use the kit's 32 px compact buttons with `small` (13/18) labels and body text; 40 px / 15 px stays the default for full pages.
4. **Buttons** map to the kit's variants: `btn-primary`, `btn-secondary`, ghost (a bare button), `btn-danger` (danger-100 fill, danger-700 text; replaces solid #c34545), `btn-icon`. Every button keeps a 44 px target.
5. **Mascot**: one `Mascot` component inlines the layered SVGs (ids made unique per instance). Used: head in a ginger circle (brand mark, dev launcher), box (empty basket), peek (no notes), sleep (Whole page loading), sit (help page).
6. **Page overlays** (pick highlight, padding/margin, layout handles, inserted placeholders) are not components: they use ginger, lime and nose-pink from the palette and are exempt from the stroke rule, which a test enforces for everything else.
7. **Note markers** use five brand colours (Charcoal, Ginger 500, Collar Lime 500, Nose Pink 500, Info 700) with a readable number colour for each.

## Open (asked the user)
- The kit has no icon set; the Charcoal pill toolbar with 48 px icon buttons waits for one.
- Fredoka, Inter and JetBrains Mono are not in the kit; fonts fall back to system-ui until the woff2 files are added.
- Five kit pairs are under 4.5:1 (primary-hover with Charcoal 4.13, danger 4.37, danger hover 3.90, info 4.48, success 4.49); kept as given and pinned by a test.
