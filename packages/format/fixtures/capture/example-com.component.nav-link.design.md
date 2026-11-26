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

## Responsive
| Part | Property | 375px | 1280px |
| --- | --- | --- | --- |
| container | font-size | 16px (1rem) | 14px (0.875rem) |
| container | padding | 12px 16px (0.75rem 1rem) | – |

- Media queries that style it: `(max-width: 1023px)`.
- Read at each width with the page's own styles: values as rendered there, – where it is not set. Each width stands for its range, up to the next media query listed.

## Variants
| Variant | Uses | Differences from this one | Example |
| --- | --- | --- | --- |
| nav-link | 3 | same styles | `header nav > a:nth-of-type(1)` |
| nav-link-2 | 1 | color #0f62fe, font-weight 600 | `header nav > a:nth-of-type(4)` |
