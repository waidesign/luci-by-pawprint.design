---
name: site-spacing
scope: system
type: spacing
source: https://example.com/
captured: 2026-11-14
method: measured
pages: ["/pricing", "/blog"]
---

## Scale
| Value | Authored | Token | Uses | Pages |
| --- | --- | --- | --- | --- |
| 3px |  |  | 1 | /pricing |
| 4px |  | `--space-1` | 6 | /pricing |
| 8px |  | `--space-2` | 24 | all |
| 10px |  |  | 2 | /pricing |
| 12px |  | `--space-3` | 4 | /blog |
| 16px |  | `--space-4` | 22 | /pricing |
| 20px |  | `--space-4` | 6 | /blog |
| 24px |  |  | 9 | /pricing |
| 32px |  | `--space-8` | 5 | /blog |
| 48px |  | `--space-12` | 4 | /pricing |

## Base unit
- 4px: 96% of spacing uses are multiples of it.

## Outliers
| Value | Uses |
| --- | --- |
| 3px | 1 |
| 10px | 2 |

## Conflicts
| What | Values by page |
| --- | --- |
| token --space-4 | 16px on /pricing; 20px on /blog |

- The same role or token has different values on these pages. Decide which one the site means before building with it.
