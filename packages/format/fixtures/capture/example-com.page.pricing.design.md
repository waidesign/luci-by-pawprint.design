---
name: pricing
scope: page
type: page
source: https://www.example.com/pricing
captured: 2026-11-12
method: measured
---

## Typography
### Roles
| Role | Family | Size | Weight | Line height | Letter spacing | Color | Uses | Elements |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| display | Inter, sans-serif | 48px | 700 | 56px | -0.96px | #161616 | 1 | h1 |
| heading-2 | Inter, sans-serif | 32px | 600 | 40px | normal | #161616 | 3 | h2 |
| body | Inter, sans-serif | 16px | 400 | 24px | normal | #393939 | 24 | p, li |
| label | Inter, sans-serif | 14px | 600 | 20px | 0.16px | #ffffff | 4 | a, button |
| code | "JetBrains Mono", monospace | 14px | 400 | 20px | normal | #393939 | 2 | code |

### Families
| Family | Uses |
| --- | --- |
| Inter, sans-serif | 32 |
| "JetBrains Mono", monospace | 2 |

### Scale
| Size | Token | Uses |
| --- | --- | --- |
| 48px | `--text-4xl` | 1 |
| 32px |  | 3 |
| 16px |  | 24 |
| 14px |  | 6 |

## Colors
### Roles
| Role | Value | Authored | Token | Uses | Properties |
| --- | --- | --- | --- | --- | --- |
| background | #ffffff | `var(--color-bg)` | `--color-bg` | 12 | background-color |
| background | #f4f4f4 |  |  | 3 | background-color |
| text | #161616 | `var(--color-text)` | `--color-text` | 30 | color |
| border | #e0e0e0 |  |  | 8 | border-top-color, border-bottom-color |
| accent | #0f62fe | `var(--color-primary)` | `--color-primary` | 5 | background-color, color |

### Tokens
| Token | Value | Uses |
| --- | --- | --- |
| `--color-bg` | #ffffff | 12 |
| `--color-primary` | #0f62fe | 5 |
| `--color-text` | #161616 | 30 |
| `--color-unused` | #0f62fe80 | 0 |

## Spacing
### Scale
| Value | Authored | Token | Uses |
| --- | --- | --- | --- |
| 4px |  | `--space-1` | 6 |
| 8px |  | `--space-2` | 14 |
| 16px |  | `--space-4` | 22 |
| 24px |  |  | 9 |
| 48px |  | `--space-12` | 4 |

### Base unit
- 4px: 95% of spacing uses are multiples of it.

### Outliers
| Value | Uses |
| --- | --- |
| 10px | 2 |
| 3px | 1 |

## Components
- 2 kinds of component on this page, each with its variants and the states its stylesheet rules give it. For a state done in JavaScript, capture that component on its own with Luci.

### primary-button
- button · example: `main section:nth-of-type(2) a`

#### Tokens
| Token | Value | Used for |
| --- | --- | --- |
| `--color-primary` | #0f62fe | background-color |
| `--radius-md` | 8px | border-radius |

#### Anatomy
- container — a (link): display inline-flex, gap 8px, padding 12px 20px, border-radius 8px (`--radius-md`), background-color #0f62fe (`--color-primary`)
- label — text: font-size 16px, line-height 24px, font-weight 600, color #ffffff
- icon — svg, optional: width 16px, height 16px

#### States
| State | Changes | Read from |
| --- | --- | --- |
| hover | background-color #0f62fe → #0353e9 | browser, state forced |
| focus-visible | outline #ffffff none 0px → #0f62fe solid 2px; outline-offset 0px → 2px | browser, state forced |
| active | background-color #0f62fe → #002d9c | browser, state forced |
| disabled | opacity 1 → 0.5; cursor pointer → not-allowed | disabled attribute |

#### Motion
- transition background-color 150ms ease-out

#### Accessibility
| Check | Part | Measured | Result |
| --- | --- | --- | --- |
| Text contrast | label | 5:1, #ffffff on #0f62fe, normal text | AA (AAA needs 7:1) |
| Target size | container | 132 × 48px | AAA (at least 44 × 44px) |
| Focus visible | container | outline change on focus-visible | Yes |

- Measured on this page against WCAG 2.2. Check again wherever the colors, sizes or focus styles differ.

### nav-link
- link · example: `header nav > a:nth-of-type(1)` · 4 on the page, 2 variants

#### Tokens
- The component uses no custom properties.

#### Anatomy
- container — a (link): font-size 14px, color #161616

#### States
| State | Changes | Read from |
| --- | --- | --- |
| hover | text-decoration-line none → underline | stylesheet rules |
| focus | Not detected: it may change through JavaScript. Capture it by hand in Luci. |  |
| active | No visible change | stylesheet rules |

#### Motion
- None.

#### Variants
| Variant | Uses | Differences from this one | Example |
| --- | --- | --- | --- |
| nav-link | 3 | same styles | `header nav > a:nth-of-type(1)` |
| nav-link-2 | 1 | color #0f62fe, font-weight 600 | `header nav > a:nth-of-type(4)` |
