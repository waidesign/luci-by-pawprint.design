---
name: image-img-16-9
scope: token
type: image
source: https://www.example.com/pricing
selector: main figure > img
captured: 2026-11-13
method: measured
reference: example-com.token.image-img-16-9.png
---

## Image
| Kind | Size | Aspect ratio | Source aspect ratio |
| --- | --- | --- | --- |
| img | 640 × 360px (40 × 22.5rem) | 16:9 | 3:2 |

## Treatment
| Property | Value | Authored | Token | On |
| --- | --- | --- | --- | --- |
| object-fit | cover |  |  |  |
| object-position | 50% 30% |  |  |  |
| aspect-ratio | 16 / 9 |  |  |  |
| box-shadow | #00000033 0px 8px 24px 0px (#00000033 0 0.5rem 1.5rem 0) | `var(--shadow-card)` | `--shadow-card` |  |
| filter | saturate(1.2) |  |  |  |
| border-radius | 12px (0.75rem) | `var(--radius-lg)` | `--radius-lg` | figure around it |

## Overlays
- div over it: linear-gradient(to top, #00000099, transparent)

## Use
- Use your own image here, shown at 16:9, object-fit cover, object-position 50% 30%, 12px (0.75rem) corners (clipped by the figure around it), with the shadow, filter and overlay listed above. The original image is not in this file, only how it is shown.

## Where used
- img: `main figure > img`
