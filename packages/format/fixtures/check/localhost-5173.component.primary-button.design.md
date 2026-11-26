---
name: primary-button
scope: component
type: button
source: http://localhost:5173/checkout
selector: form > button
captured: 2026-11-14
method: measured
---

## Tokens
- The component uses no custom properties.

## Anatomy
- container — button: display inline-flex, gap 8px, padding 12px 20px, border-radius 8px, background-color #2563eb, box-shadow #0000001a 0px 1px 2px 0px
- label — text: font-family Inter, sans-serif, font-size 16px, line-height 24px, font-weight 600, color #fff

## States
| State | Changes | Read from |
| --- | --- | --- |
| hover | background-color #2563eb → #1d4ed8 | browser, state forced |
| focus | No change | browser, state forced |
| focus-visible | No change | browser, state forced |
| active | background-color #2563eb → #002d9c | browser, state forced |
| disabled | opacity 1 → 0.5; cursor pointer → not-allowed | disabled attribute |

## Motion
- transition background-color 0.3s ease

## Accessibility
| Check | Part | Measured | Result |
| --- | --- | --- | --- |
| Text contrast | label | 5.17:1, #ffffff on #2563eb, normal text | AA (AAA needs 7:1) |
| Target size | container | 132 × 48px | AAA (at least 44 × 44px) |
| Focus visible | container | nothing changes when it has focus | No: add a visible focus style |

- Measured on this page against WCAG 2.2. Check again wherever the colors, sizes or focus styles differ.
