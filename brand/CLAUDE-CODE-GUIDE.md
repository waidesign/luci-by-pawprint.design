# Building Luci's UI with this kit (instructions for Claude Code)

Follow these steps whenever you build or change any Luci interface: the on-page toolbar, the extension panel, the dev toolbar, docs or the website. They apply from milestone M4 onwards.

## 0. Read first

1. `BRAND.md`: personality, voice, colour roles, which mascot to use for each moment.
2. `DESIGN.md`: tokens, the strict stroke rules, component specs, motion and accessibility.
3. `README.md`: what each file is, and the mascot layer names and pivots.

Save the key rules into the project memory once, so later sessions apply them without rereading everything.

## 1. Golden rules

- Use the kit's files as they are. Never redraw, recolour, crop or rename a mascot, logo or icon. If something is missing, stop and ask.
- Icons come from Lucide, and only the ones listed in `DESIGN.md` section 7 and `luci-icons.json`.
- Use only the tokens in `luci-tokens.json` and `luci-colors.css`. No other hex values, no framework default palettes, no default component-library looks.
- No coloured or strong strokes on components. Only the subtle neutral strokes in `DESIGN.md` section 4. The Charcoal outline belongs to the mascot art only.
- All user-facing text follows the voice rules in `BRAND.md`: short, factual, no exclamation marks, no emoji.
- Luci appears only when something needs the user. Never add attention-seeking motion, pop-ups or badges.

## 2. Where things go in the repository

Keep the kit unchanged in `brand/` at the repository root. Generate code from it; do not edit it.

```
brand/                          the kit, read-only
packages/ui/                    shared UI for every surface
  src/tokens.css                CSS variables generated from brand/luci-tokens.json
  src/tokens.ts                 the same values as typed constants
  src/fonts/                    self-hosted Fredoka, Inter, JetBrains Mono (woff2)
  src/mascot/                   layered SVGs copied from brand/layered/ + luci-animations.css
  src/components/               Button, Badge, Toast, Card, Input, Tooltip, EmptyState, Mascot, Toolbar
  src/icons.ts                  the approved Lucide icons under Luci names, generated from luci-icons.json
  src/copy.ts                   every user-facing string, in one place
packages/extension/public/      icons copied from brand/favicon/ (icon-192, icon-512) and brand/logo/
apps/site/public/               everything in brand/favicon/
```

Add a small script, `pnpm brand:sync`, that copies the needed files from `brand/` and regenerates `tokens.css` and `tokens.ts`. Run it instead of copying by hand.

## 3. Tokens

- Generate CSS custom properties named `--luci-<group>-<name>` from `luci-tokens.json`.
- The toolbar renders inside a Shadow DOM, where variables from the host page do not apply. Declare the variables on `:host` inside the shadow root, not on `:root`.
- Components reference variables only, for example `background: var(--luci-color-primary)`, never raw hex values.

## 4. Fonts

The toolbar runs on any website, and many sites block external fonts through their Content Security Policy. So:

- Self-host Fredoka, Inter and JetBrains Mono as woff2 files inside the package. All three are under the SIL Open Font License, which allows bundling.
- Load them with `@font-face` inside the shadow root.
- Always keep the fallbacks: `system-ui, sans-serif` and `ui-monospace, monospace`.

## 5. Icons

- Install `lucide-preact` in `packages/ui` (and `lucide-react` wherever React is used).
- Have `pnpm brand:sync` generate `src/icons.ts` from `brand/luci-icons.json`: one export per Luci name, for example `export { Pipette as IconColour } from 'lucide-preact'`. Components import icons only from `icons.ts`, never from `lucide-preact` directly, so only approved icons can appear.
- Build one `Icon` wrapper that applies the kit style: `strokeWidth={1.75}`, `size` 22, 20 or 16, colour `currentColor`, `aria-hidden="true"`.
- Import icons one by one so unused icons are left out of the bundle.
- Keep Lucide's licence notice in the repository's third-party notices.
- Replace the toolbar's temporary text labels with icon-only buttons, each with an `aria-label` and a tooltip showing the name and shortcut.

## 6. The mascot component

Build one `Mascot` component; never place mascot files ad hoc.

```ts
type MascotPose =
  | 'sit' | 'hello' | 'head' | 'peek' | 'measure'
  | 'box' | 'sleep' | 'content' | 'annoyed' | 'turned';

<Mascot pose="peek" size={128} animated label="Luci watching" />
```

- Import the layered SVGs from `brand/layered/` as raw strings and inline them, so `luci-animations.css` can animate their named parts. `hello` is the `sit` file with the extra class `luci-hello` on the root.
- When the same pose can appear twice on one page, rewrite the clip-path ids inside the SVG with a unique prefix per instance.
- `animated={false}` renders it still. Under `prefers-reduced-motion` the CSS already stops every loop.
- Decorative use: `aria-hidden="true"`. Meaningful use: `role="img"` and an `aria-label`.
- Pick the pose from the table in `BRAND.md` section 5. Toast faces come from `brand/mascot/luci-face-*.svg`.

## 7. Components to build first, in this order

1. Tokens, fonts, the `Icon` wrapper and the `Mascot` component.
2. `Button` (primary, secondary, ghost, danger, icon).
3. `Badge` and count.
4. `Toast` and inline status message.
5. `Card` and panel.
6. `Input`.
7. `Tooltip`.
8. `EmptyState`.
9. `Toolbar` (the Charcoal pill), built from the pieces above.

Each one must match its spec in `DESIGN.md` section 6 exactly: fills, text, stroke, radius, height and hover state.

## 8. Copy

- Put every string in `copy.ts`, grouped by surface and moment.
- Start from the examples in `BRAND.md` section 2.
- Add a unit test that fails if any string contains `!`, an emoji, or the words "oops", "yay" or "buddy".

## 9. Checks before you call a UI task done

- [ ] No hex value outside `tokens.css` and `tokens.ts`.
- [ ] No `border` or `outline` using a ginger, lime, pink, gold or status colour, and no solid Charcoal border except the focus ring. Add a lint or test that searches the styles for this.
- [ ] Every text and background pair passes 4.5:1 (3:1 at 24 px and larger). Add a test that checks the pairs used by components.
- [ ] Every interactive element is a real `button`, `a` or `input`, at least 44 px, with a visible `:focus-visible` ring.
- [ ] Reduced motion stops all loops and makes UI transitions instant.
- [ ] The toolbar renders correctly on at least three very different host sites (light, dark and a busy page), with its styles fully isolated.
- [ ] Every icon comes from `icons.ts`; icon-only buttons have an `aria-label` and a tooltip.
- [ ] The mascot pose matches the moment, per `BRAND.md`.
- [ ] Copy follows the voice rules.

## 10. When you are unsure

Do not invent new colours, poses, icons or patterns. Describe what is missing and ask. Keeping Luci consistent matters more than finishing a screen quickly.
