---
name: site-color
scope: system
type: color
source: https://example.com/
captured: 2026-11-14
method: measured
pages: ["/pricing", "/blog"]
---

## Roles
| Role | Value | Authored | Token | Uses | Properties | Pages |
| --- | --- | --- | --- | --- | --- | --- |
| background | #ffffff | `var(--color-bg)` | `--color-bg` | 32 | background-color | all |
| background | #f4f4f4 |  |  | 3 | background-color | /pricing |
| text | #161616 | `var(--color-text)` | `--color-text` | 80 | color | all |
| border | #e0e0e0 |  |  | 14 | border-top-color, border-bottom-color | all |
| accent | #0f62fe | `var(--color-primary)` | `--color-primary` | 5 | background-color, color | /pricing |
| accent | #0043ce | `var(--color-primary)` | `--color-primary` | 3 | color | /blog |

## Tokens
| Token | Value | Uses | Pages |
| --- | --- | --- | --- |
| `--color-bg` | #ffffff | 32 | all |
| `--color-primary` | #0f62fe | 8 | all |
| `--color-text` | #161616 | 80 | all |
| `--color-unused` | #0f62fe80 | 0 | /pricing |

## Conflicts
| What | Values by page |
| --- | --- |
| token --color-primary | #0f62fe on /pricing; #0043ce on /blog |

- The same role or token has different values on these pages. Decide which one the site means before building with it.
