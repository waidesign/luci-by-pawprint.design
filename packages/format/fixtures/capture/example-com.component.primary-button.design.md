---
name: primary-button
scope: component
type: button
source: https://example.com/pricing
selector: main section:nth-of-type(2) a
captured: 2026-11-12
method: measured
---

## Tokens
| Token | Value | Used for |
| --- | --- | --- |
| `--color-primary` | #0f62fe | background-color |
| `--radius-md` | 8px | border-radius |

## Anatomy
- container — a (link): display inline-flex, gap 8px, padding 12px 20px, border-radius 8px (`--radius-md`), background-color #0f62fe (`--color-primary`)
- label — text: font-size 16px, line-height 24px, font-weight 600, color #ffffff
- icon — svg, optional: width 16px, height 16px

## States
| State | Changes | Read from |
| --- | --- | --- |
| hover | background-color #0f62fe → #0353e9 | browser, state forced |
| focus-visible | outline #ffffff none 0px → #0f62fe solid 2px; outline-offset 0px → 2px | browser, state forced |
| active | background-color #0f62fe → #002d9c | browser, state forced |
| disabled | opacity 1 → 0.5; cursor pointer → not-allowed | disabled attribute |

## Motion
- transition background-color 150ms ease-out
