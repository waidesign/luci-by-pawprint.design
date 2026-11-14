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

## Update, same day: icons, fonts, toolbar, buttons (user's go)
8. **Icons**: the user approved Lucide and updated the kit (`brand/luci-icons.json`, DESIGN.md section 7). `pnpm brand:sync` generates `packages/ui/src/icons.ts`, the only file allowed to import `lucide-preact` (a test enforces it); `Icon` applies 1.75 stroke, currentColor, 22/20/16 px.
9. **Fonts**: Fredoka, Inter, JetBrains Mono (Fontsource 5.3.0, variable Latin, OFL) in `packages/ui/src/fonts/`. On pages they are registered with the FontFace API from bytes under "Luci ..." names: no fetch (a page's CSP cannot block them), no clash with the page's fonts, and shadow roots use them. The extension help page uses @font-face from its own files. Cost: about 160 KB in the toolbar bundles.
10. **Toolbar**: the kit's Charcoal pill. Luci's head is the menu (brand, help, settings); the six tools are 48 px icon-only buttons with tooltips; the active tool is ginger-400 with a Charcoal icon (6.9:1, fixing the weak active-tab contrast); the basket is a Collar Lime pill. Feedback and Layout use the same pill; their buttons keep text labels where no icon is approved (Notes, Select, New page, Redo, Reset).
11. **Buttons**: `Button` with variants primary, secondary, outline, ghost, danger (kept as the user liked it), link; sizes sm 32 / md 40 / lg 48; icon-only and with-icon; states hover, pressed (1 px nudge), focus ring, disabled, loading (aria-busy), toggled (aria-pressed).
12. **Luci in motion**: hello greets once on first run; sitting in the menu; measuring beside the Spacing hint; in the box for an empty basket; peeking for no notes; asleep while Whole page reads; annoyed when a capture fails.
13. **Pixel loupe**: Pixel mode shows the 15 x 15 pixels around the pointer at 8x, the picked one framed.
14. **Selects** draw their chevron with CSS (two gradients in the text colour), 12 px from the edge everywhere; the kit's icon list has no chevron.
15. **Copy**: shorter, factual hints and labels across the toolbar, Feedback, Layout and the sketch.

## Update 2: states, shortcuts, more icons (user's go)
16. **One "on" look everywhere**: any pressed button (tool, toggle, segment) is ginger-400 with Charcoal, also while hovered. The tool in use stays marked with the menu or basket open, and in Pixel mode. Hover on Charcoal is muzzle-700.
17. **Tooltips above cards**: cards in the shell column drop their stand-alone z-index (flex items honour z-index unpositioned); the pill sits at z-index 2. Stand-alone cards (Feedback, Layout) sit one layer below their pill.
18. **Shortcuts** (`useShortcuts` in @luci/ui; never while typing, never with a modifier): Capture V T C S P K B M; Feedback A N P M; Layout S I N. Tooltips show "Name  Key"; buttons carry aria-keyshortcuts; the menu lists them.
19. **Icons added with the user's approval**: notes `list`, select `mouse-pointer-click`, new-page `file-plus`, redo `redo-2`, reset `rotate-ccw`, chevron `chevron-down`. Feedback and Layout pills are now icon-only, counts as badges. `Select` wraps every select with the chevron icon (replaces the CSS-drawn one).
20. **Flaky dev-toolbar test, found**: Pause waits until no animation runs, and `document.getAnimations()` includes Luci's mascot in the shadow root. `Mascot` rebuilt its SVG (new ids) on every render, so Preact replaced it and a fresh, running copy undid the pause. `Mascot` and `Face` now build the SVG once per instance; this also stops Luci's loops restarting on every state change. The `luci init` e2e test got its own 90 s limit (6 s alone, over 30 s under full parallel load).

## Open (asked the user)
- The kit has no icon set; the Charcoal pill toolbar with 48 px icon buttons waits for one.
- Fredoka, Inter and JetBrains Mono are not in the kit; fonts fall back to system-ui until the woff2 files are added.
- Five kit pairs are under 4.5:1 (primary-hover with Charcoal 4.13, danger 4.37, danger hover 3.90, info 4.48, success 4.49); kept as given and pinned by a test.
