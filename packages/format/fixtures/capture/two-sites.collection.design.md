---
name: two-sites
scope: collection
captured: 2026-11-12
items: 3
sources: ["https://example.com/pricing", "https://shop.example.org/"]
---

# Components

## Signup button
- source: https://example.com/pricing
- selector: `main a.cta`
- type: component button · method: measured · captured: 2026-11-12

### Tokens
- The component uses no custom properties.

### Anatomy
- container — a (link): background-color #0f62fe

### States
| State | Changes | Read from |
| --- | --- | --- |
| hover | background-color #0f62fe → #0353e9 | browser, state forced |

### Motion
- None.

# Text

## Shop heading
- source: https://shop.example.org/
- selector: `h1`
- type: token text · method: measured · captured: 2026-11-12

### Text style
| Property | Value | Authored | Token |
| --- | --- | --- | --- |
| font-family | Georgia, serif |  |  |
| font-size | 40px |  |  |
| font-weight | 700 |  |  |
| line-height | 48px |  |  |
| letter-spacing | normal |  |  |
| color | #222831 |  |  |

### Where used
- h1 (heading): `h1`

# Colours

## Example accent
- source: https://example.com/pricing
- selector: `main a.cta`
- type: token color · method: measured · captured: 2026-11-12

### Colour
| Value | Authored | Token | Role |
| --- | --- | --- | --- |
| #0f62fe | `var(--color-primary)` | `--color-primary` | accent |

### Where used
| Element | Property | Selector |
| --- | --- | --- |
| a (link) | background-color | `main a.cta` |
