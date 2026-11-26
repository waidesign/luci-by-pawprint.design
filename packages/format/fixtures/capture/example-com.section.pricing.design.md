---
name: pricing
scope: section
type: section
source: https://example.com/pricing
selector: "#pricing"
captured: 2026-11-13
method: measured
---

## Tokens
| Token | Value | Used for |
| --- | --- | --- |
| `--ink` | #161616 | color |
| `--space-12` | 48px | row-gap, column-gap |
| `--space-6` | 24px | row-gap, column-gap, padding |

## Structure
- container — section (region): display grid, row-gap 48px (`--space-12`), padding 96px 24px (`96px var(--space-6)`), background-color #f4f4f4
  - group — div: max-width 640px
    - heading — h2 (heading): font-size 40px, font-weight 700, color #161616 (`--ink`)
    - description — p (paragraph): font-size 18px
  - grid — div: display grid, column-gap 24px (`--space-6`), grid-template-columns 344px 344px 344px (`repeat(3, minmax(0, 1fr))`), max-width 1080px
    - card ×3 — div → component `plan-card` (`example-com.component.plan-card.design.md`), variants in order: `plan-card`, `plan-card-2`, `plan-card`
  - image — img: image slot 1080 × 320px, 27:8

- Each component is described once, in its own file (listed under Components); this file places them. A button or field inside another component has its own file too, for its states. Text parts give their text style only, never the text.

## Components
| Component | Type | Uses here | Variants | File |
| --- | --- | --- | --- | --- |
| `plan-card` | card | 3 | 2 | `example-com.component.plan-card.design.md` |
| `primary-button` | button | 3, inside `plan-card` | 1 | `example-com.component.primary-button.design.md` |

## Responsive
| Part | Property | 375px | 768px | 1280px |
| --- | --- | --- | --- | --- |
| container | padding | 48px 16px | 96px 24px | 96px 24px |
| heading | font-size | 28px | 40px | 40px |
| description | shown | no | yes | yes |
| grid | grid-template-columns | 1 column | 2 columns | 3 columns |

- Media queries that style it: `(min-width: 768px)`, `(min-width: 1024px)`.
- Read at each width with the page's own styles: values as rendered there, – where it is not set. Each width stands for its range, up to the next media query listed.

## Accessibility
| Check | Part | Measured | Result |
| --- | --- | --- | --- |
| Text contrast | heading | 16.45:1, #161616 on #f4f4f4, large text | AAA |

- Measured on this page against WCAG 2.2. Check again wherever the colors, sizes or focus styles differ.
