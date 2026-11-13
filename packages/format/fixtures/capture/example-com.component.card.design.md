---
name: card
scope: component
type: card
source: https://example.com/blog
selector: main article:nth-of-type(1)
captured: 2026-11-13
method: measured
---

## Tokens
| Token | Value | Used for |
| --- | --- | --- |
| `--radius-lg` | 12px | border-radius |

## Anatomy
- container — article (article): display flex, flex-direction column, border-radius 12px (`--radius-lg`), background-color #ffffff
- image — img: width 360px, height 202.5px
- heading — h3 (heading): font-size 20px, font-weight 600, color #161616

## Images
| Part | Kind | Size | Shape | Fit | Corners | Effects | Layers over it |
| --- | --- | --- | --- | --- | --- | --- | --- |
| image | img | 360 × 202.5px | 16:9 (file is 3:2), set by aspect-ratio 16 / 9 | cover, position 50% 30% | 12px (`--radius-lg`), top corners, clipped by the container | filter saturate(1.2) | div over it: linear-gradient(to top, #00000099, transparent) |

- These are slots for your own images, framed as above. No image file or URL is included.

## States
| State | Changes | Read from |
| --- | --- | --- |
| hover | box-shadow none → #00000033 0px 8px 24px 0px; image transform none → scale(1.05) | browser, state forced |

## Motion
- transition box-shadow 0.2s ease
- image: transition transform 0.4s ease-out

## Accessibility
| Check | Part | Measured | Result |
| --- | --- | --- | --- |
| Text contrast | title | 14.81:1, #ffffff on #282828, large text | AAA. Estimated: the background is an image, a gradient or see-through |
| Text contrast | meta | 4.56:1, #6f6f6f on #f4f4f4, normal text | AA (AAA needs 7:1) |

- Measured on this page against WCAG 2.2. Check again wherever the colors, sizes or focus styles differ.
