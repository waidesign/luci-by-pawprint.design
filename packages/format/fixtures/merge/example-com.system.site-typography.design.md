---
name: site-typography
scope: system
type: typography
source: https://example.com/
captured: 2026-11-14
method: measured
pages: ["/pricing", "/blog"]
---

## Roles
| Role | Family | Size | Weight | Line height | Letter spacing | Color | Uses | Elements | Pages |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| display | Inter, sans-serif | 48px | 700 | 56px | -0.96px | #161616 | 1 | h1 | /pricing |
| heading-1 | Inter, sans-serif | 40px | 700 | 48px | normal | #161616 | 1 | h1 | /blog |
| heading-2-2 | Inter, sans-serif | 32px | 600 | 40px | normal | #161616 | 3 | h2 | /pricing |
| heading-2 | Inter, sans-serif | 28px | 700 | 36px | normal | #161616 | 4 | h2 | /blog |
| body | Inter, sans-serif | 16px | 400 | 24px | normal | #393939 | 64 | p, li | all |
| label | Inter, sans-serif | 14px | 600 | 20px | 0.16px | #ffffff | 6 | a, button | all |
| code | "JetBrains Mono", monospace | 14px | 400 | 20px | normal | #393939 | 2 | code | /pricing |

## Families
| Family | Uses |
| --- | --- |
| "Inter", system-ui, sans-serif | 79 |
| "JetBrains Mono", monospace | 2 |

## Scale
| Size | Token | Uses |
| --- | --- | --- |
| 48px | `--text-4xl` | 1 |
| 40px |  | 1 |
| 32px |  | 3 |
| 28px |  | 4 |
| 16px |  | 64 |
| 14px |  | 8 |

## Conflicts
| What | Values by page |
| --- | --- |
| role heading-2 | Inter, sans-serif 32px/40px 600 #161616 on /pricing; Inter, sans-serif 28px/36px 700 #161616 on /blog |

- The same role or token has different values on these pages. Decide which one the site means before building with it.
