---
name: text-heading-1
scope: token
type: text
source: https://www.example.com/pricing
selector: main h1
captured: 2026-11-12
method: measured
---

## Text style
| Property | Value | Authored | Token |
| --- | --- | --- | --- |
| font-family | Inter, system-ui, sans-serif | `var(--font-sans)` | `--font-sans` |
| font-size | 48px (3rem) | `clamp(2rem, 5vw, 3rem)` |  |
| font-weight | 700 |  |  |
| line-height | 55.2px (3.45rem) | `1.15` |  |
| letter-spacing | -0.96px (-0.06rem) | `-0.02em` |  |
| color | #161616 | `var(--color-text)` | `--color-text` |

## Where used
- h1 (heading): `main h1`

## Accessibility
| Check | Part | Measured | Result |
| --- | --- | --- | --- |
| Text contrast |  | 18.09:1, #161616 on #ffffff, large text | AAA |

- Measured on this page against WCAG 2.2. Check again wherever the colors, sizes or focus styles differ.
