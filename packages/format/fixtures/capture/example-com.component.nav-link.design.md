---
name: nav-link
scope: component
type: link
source: https://example.com/
selector: header nav > a:nth-of-type(1)
captured: 2026-11-12
method: measured
---

## Tokens
- The component uses no custom properties.

## Anatomy
- container — a (link): font-size 14px (0.875rem), color #161616

## States
| State | Changes | Read from |
| --- | --- | --- |
| hover | text-decoration-line none → underline | stylesheet rules |
| focus | Not detected: it may change through JavaScript. Capture it by hand in Luci. |  |
| active | No visible change | stylesheet rules |

## Motion
- None.

## Variants
| Variant | Uses | Differences from this one | Example |
| --- | --- | --- | --- |
| nav-link | 3 | same styles | `header nav > a:nth-of-type(1)` |
| nav-link-2 | 1 | color #0f62fe, font-weight 600 | `header nav > a:nth-of-type(4)` |
