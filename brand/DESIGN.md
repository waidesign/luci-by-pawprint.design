---
name: luci-ui
scope: system
type: product-ui
source: Luci brand kit
captured: 2026-11-14
method: authored
version: 1.0
---

# Luci UI design system

The rules for every Luci interface: the on-page toolbar, the extension panel, the dev toolbar, docs and the website. Values are in `luci-tokens.json` and `luci-colors.css`. Personality, voice and mascot usage are in `BRAND.md`.

## 1. Principles

1. **Quiet surfaces, clear content.** Warm neutral backgrounds, Charcoal text, one ginger accent per view.
2. **No strong strokes.** Components are separated by tint and space, not by outlines (section 4).
3. **Colour carries meaning, never decoration.** Ginger means primary action or brand. Status colours mean status.
4. **Still by default.** Motion is short and functional; the mascot is the only thing that idles.
5. **Built to sit on any website.** Every component must stay readable over unknown host pages.

## 2. Colour tokens

| Token | Value | Role |
| --- | --- | --- |
| `surface` | #F5EFEA | Page, panel and toolbar-sheet background (Muzzle White) |
| `surface-raised` | #FDF9F6 | Cards, menus, popovers on `surface` |
| `surface-sunken` | #EBE5E0 | Inputs, code blocks, table headers |
| `ink` | #2B2B2B | Primary text, icons, dark toolbar |
| `ink-secondary` | #656360 | Secondary text (4.5:1 or better on `surface`) |
| `ink-disabled` | #A29D99 | Disabled text and icons only |
| `primary` | #EC862B | Primary button fill, brand marks |
| `on-primary` | #2B2B2B | Text and icons on `primary` |
| `primary-hover` | #D86D1D | Primary button hover fill |
| `primary-soft` | #FEEBD1 | Selected rows, active tab background |
| `link` | #AD4F1A | Links and ginger text on light surfaces |
| `accent` | #B4D43C | Counts and the basket badge only |
| `success` / `success-bg` | #3F7932 / #DFF3D5 | Success text / background |
| `warning` / `warning-bg` | #975F03 / #FEEDC9 | Warning text / background |
| `danger` / `danger-bg` | #C5372F / #FFE3DF | Error text / background |
| `info` / `info-bg` | #1E767F / #D9F0F3 | Info text / background |

Dark surfaces (the toolbar pill, dark mode): background `ink` #2B2B2B, text `surface` #F5EFEA, secondary text #C2BCB8, active tool fill ginger-400 #F6A24F with Charcoal icon.

## 3. Type

| Token | Font | Size / line height | Weight | Use |
| --- | --- | --- | --- | --- |
| `display` | Fredoka | 40 / 44 | 600 | Website and docs titles |
| `title` | Fredoka | 24 / 30 | 600 | Panel titles, empty-state titles |
| `heading` | Inter | 17 / 24 | 600 | Section headings, toast titles |
| `body` | Inter | 15 / 22 | 400 | Default text |
| `small` | Inter | 13 / 18 | 500 | Captions, labels, metadata |
| `micro` | Inter | 12 / 16 | 600 | Badges, uppercase overlines (0.06em tracking) |
| `code` | JetBrains Mono | 13 / 20 | 500 | Selectors, values, file paths |

Fallbacks: `system-ui, sans-serif` and `ui-monospace, monospace`. Sentence case everywhere; uppercase only for `micro` overlines.

## 4. Strokes and borders (strict)

Components use **no strong strokes and no coloured strokes**. Separation comes from surface tints, spacing and, where needed, a subtle neutral line.

**Allowed**

| Token | Value | Where |
| --- | --- | --- |
| `stroke-subtle` | 1 px `rgba(43, 43, 43, 0.12)` | Cards, inputs, menus, tables, dividers on light surfaces |
| `stroke-muzzle` | 1 px #DBD4CF | Same, when a solid value is needed |
| `stroke-on-dark` | 1 px `rgba(245, 239, 234, 0.16)` | Dividers and outlines on Charcoal |
| `stroke-strong` | 1 px `rgba(43, 43, 43, 0.24)` | Input hover only |
| `focus-ring` | 2 px solid #2B2B2B, 2 px offset (on dark: #F5EFEA) | Keyboard focus only (`:focus-visible`) |

**Not allowed**

- Any border in ginger, lime, pink, gold or a status colour.
- Solid Charcoal borders on components (the focus ring is the only exception).
- Borders thicker than 1 px, double borders, or a border plus a shadow on the same element.
- Left-border accent stripes on cards or messages.

**Per component**

| Component | Stroke |
| --- | --- |
| Primary button | None |
| Secondary button | `stroke-subtle` |
| Ghost and icon buttons | None |
| Badges and counts | None |
| Status messages and toasts | None: tinted background plus coloured text and icon |
| Cards, panels, menus, popovers | `stroke-subtle`, or none when the surface tint already separates |
| Inputs | `stroke-subtle`; hover `stroke-strong`; error = `danger` text and icon below the field, not a red border |
| Tables | `stroke-subtle` row dividers only |
| Toolbar pill (Charcoal) | None |

The Charcoal outline belongs to the mascot illustrations only. It is artwork, not a UI stroke.

## 5. Space, radius and elevation

| Token | Value |
| --- | --- |
| Spacing scale | 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80 px |
| `radius-sm` | 8 px: inputs, small chips |
| `radius-md` | 12 px: menus, tooltips |
| `radius-lg` | 16 px: toasts, panels inside cards |
| `radius-xl` | 24 px: cards, sheets, the extension panel |
| `radius-full` | 9999 px: buttons, badges, the toolbar pill |
| `shadow-float` | `0 1px 2px rgba(0, 0, 0, 0.24), 0 8px 24px rgba(0, 0, 0, 0.28)` | Only for things floating over a host page: the toolbar, popovers, toasts. Black, not Charcoal, so it still shows on a dark page |
| `shadow-edge` | `inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 0 0 1px rgba(255, 255, 255, 0.05)` | Added to `shadow-float` on Charcoal surfaces only (the toolbar pill, and cards in the dark theme), so they stay apart from a host page of the same colour |

No shadows on in-flow cards. Never combine `shadow-float` with a border (`shadow-edge` is a faint inner light, not a border).

## 6. Components

**Button**

| Variant | Fill | Text | Stroke | Hover |
| --- | --- | --- | --- | --- |
| Primary | `primary` | `on-primary` | none | `primary-hover` |
| Secondary | `surface-raised` | `ink` | `stroke-subtle` | fill #EBE5E0 |
| Ghost | transparent | `ink` | none | fill `rgba(43,43,43,0.06)` |
| Danger | `danger-bg` | `danger` | none | fill #FFD3CD |
| Icon | transparent | `ink` | none | fill `rgba(43,43,43,0.06)` |

Height 40 px (32 px compact in the toolbar panel, 48 px round in the toolbar pill). Padding 0 16 px. `radius-full`. Label `heading` size 15, weight 600. One primary button per view.

**Badge and count**

Fill `primary-soft` with `link` text, or `accent` with `ink` text for counts. Height 22 px, padding 0 8 px, `micro` text, `radius-full`, no stroke.

**Status message and toast**

Fill `<status>-bg`, title in `<status>` colour at `heading` weight, detail in `ink` at `body`, 20 px status icon or a 40 to 48 px mascot face on the left, `radius-lg`, padding 12 16 px, no stroke. Toasts add `shadow-float`. Copy follows `BRAND.md` voice rules. Faces: success = slowblink, warning = focused, error = annoyed, info = calm.

**Card and panel**

`surface-raised`, `stroke-subtle`, `radius-xl`, padding 24 px. Panel headers use `title`; overlines use `micro` in `link`.

**Input**

Height 40 px, fill `surface-raised`, `stroke-subtle`, `radius-sm`, `body` text, placeholder `ink-secondary`. Label above in `small` weight 600. Error: message below in `danger` with an icon; the border does not change colour.

**Tooltip**

Fill `ink`, text `surface`, `small`, `radius-md`, padding 6 10 px, no stroke, appears after 300 ms.

**On-page toolbar**

Charcoal pill, `radius-full`, padding 8 px, `shadow-float`, no stroke. Luci's head (app icon) as the 48 px menu button. Tool buttons 48 px round with 22 px line icons in `surface`; active tool filled ginger-400 with `ink` icon; basket as an `accent` pill with `ink` text. Always above host content (top z-index inside its Shadow DOM).

**Empty state**

Centred mascot (Watching, 120 to 160 px), `title`, one `body` line in `ink-secondary`, optional primary button. No illustration other than Luci.

## 7. Icons

Luci uses **Lucide** (lucide.dev), a free line-icon set under the ISC licence, which is compatible with MIT. Install `lucide-preact` for the toolbar and extension, or `lucide-react` for React surfaces. Do not draw custom icons, mix in another icon set or use emoji.

**Style**

| Setting | Value |
| --- | --- |
| Stroke width | 1.75 (Lucide `strokeWidth={1.75}`), round caps and joins (Lucide default) |
| Size | 22 px in the toolbar pill, 20 px in content and status messages, 16 px in compact buttons and inputs |
| Colour | `currentColor` only, so the icon follows the button's text colour |
| Fill | none; never filled icons, never ginger icons on Muzzle |

An icon is a line drawing, not a component border, so the stroke rules in section 4 do not apply to it.

**Approved icons**

Only use the icons in this table (also in `luci-icons.json`). If a screen needs one that is not listed, stop and ask.

| Luci name | Lucide icon | Use |
| --- | --- | --- |
| `menu` | Luci's head (`logo/luci-mark-tile.svg`) | Toolbar menu button; not a Lucide icon |
| `component` | `square-dashed-mouse-pointer` | Pick a component |
| `section` | `panel-top-dashed` | Pick a section |
| `page` | `app-window` | Whole page |
| `text` | `type` | Text and typography |
| `colour` | `pipette` | Colour eyedropper |
| `spacing` | `ruler-dimension-line` | Spacing ruler |
| `check` | `scan-eye` | Design check |
| `annotate` | `message-square-plus` | Add a feedback note |
| `basket` | `shopping-basket` | Capture basket |
| `copy` | `clipboard-copy` | Copy prompt or design.md |
| `send` | `send` | Send to the agent |
| `download` | `download` | Export a file |
| `images-off` | `image-off` | Block images |
| `pause` | `circle-pause` | Pause page animations |
| `settings` | `settings` | Settings |
| `close` | `x` | Close panel, hide toolbar |
| `minimise` | `minus` | Collapse the toolbar |
| `undo` | `undo-2` | Undo |
| `edit` | `pencil` | Edit a note |
| `delete` | `trash-2` | Delete a note or capture |
| `add` | `plus` | Add |
| `hide` | `eye-off` | Hide markers |
| `success` | `circle-check` | Success status |
| `warning` | `triangle-alert` | Warning status |
| `error` | `circle-x` | Error status |
| `info` | `info` | Info status |
| `notes` | `list` | Feedback notes list |
| `select` | `mouse-pointer-click` | Select an element to change its layout |
| `new-page` | `file-plus` | Sketch a new page |
| `redo` | `redo-2` | Redo |
| `reset` | `rotate-ccw` | Put the page back as the code has it |
| `chevron` | `chevron-down` | Dropdowns and menus that open |

**Rules**

- Toolbar buttons are icon-only, with an `aria-label` and a tooltip that shows the name and shortcut, for example "Colour  C". The icon itself has `aria-hidden="true"`.
- Menus, panels and settings show the icon with a text label.
- Status messages always pair the status icon with words.

## 8. Motion

| Token | Value | Use |
| --- | --- | --- |
| `motion-fast` | 150 ms ease-out | Hover, press, colour changes |
| `motion-base` | 200 ms ease-out | Menus, popovers, toasts in |
| `motion-exit` | 150 ms ease-in | Anything leaving |

Animate opacity and transform only, at most 8 px of travel, no bounce. Mascot loops come from `luci-animations.css`. Under `prefers-reduced-motion: reduce`, UI transitions become instant and mascot loops stop.

## 9. Accessibility

- Text contrast 4.5:1 or better (3:1 for 24 px and larger). Checked pairs: Charcoal on Muzzle 12.4:1, Charcoal on Ginger 500 5.4:1, Ginger 700 on Muzzle 4.7:1.
- Every interactive element is a real `button`, `a` or `input`, at least 44 px for touch (toolbar buttons 48 px).
- Visible `focus-ring` on keyboard focus, never removed.
- Icon-only buttons have `aria-label`; mascot images have meaningful `alt` or `aria-hidden` when decorative.
- Status is never colour alone: always an icon or words.
