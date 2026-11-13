# Images are described inside component files, not captured on their own: a component file gets an Images section with one row per image slot (img, video, canvas, SVG <image>, or a background photo, the component's own included), named as its part in Anatomy so States and Motion read with it: kind, size, shape and the file's own shape, fit and position, corners (incl. which ones an element around it clips), effects and layers over it. No URL, no pixels. A bare img/picture/video/canvas/SVG image is greyed out and points to the component around it; photo backgrounds no longer block picking. The Image tool, reference screenshots (FR22) and the basket .zip export were removed.

- Date: 2026-11-13
- Status: accepted
- Area: capture

## What
Images are described inside component files, not captured on their own: a component file gets an Images section with one row per image slot (img, video, canvas, SVG <image>, or a background photo, the component's own included), named as its part in Anatomy so States and Motion read with it: kind, size, shape and the file's own shape, fit and position, corners (incl. which ones an element around it clips), effects and layers over it. No URL, no pixels. A bare img/picture/video/canvas/SVG image is greyed out and points to the component around it; photo backgrounds no longer block picking. The Image tool, reference screenshots (FR22) and the basket .zip export were removed.

## Why
User request 2026-11-13 after trying the Image tool: an image's treatment matters inside the component that uses it, and downloading images or screenshots is easy by hand. Supersedes the same day's Image tool decision (commit 043edad, reverted). PRD: goal 6, eligibility table, FR4, new FR17a, FR22 dropped, success check and decision "Images" updated. Format: component field images (componentImageSchema), section Images between Anatomy and States, golden example-com.component.card.design.md.

## Alternatives considered
_Not recorded._
