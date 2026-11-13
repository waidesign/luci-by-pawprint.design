# Images are selectable with a new Image tool that records only how an image is shown (kind, size, aspect ratio and the source ratio, fit, position, corners incl. a clipping wrapper, shadow, filters, mask, overlays); every url(...) is written <image>, so no URL or pixels reach a file (FR21). Any pick of an element can add a reference screenshot (FR22): full PNG downloaded beside the file and named in a new optional frontmatter field `reference`; the basket keeps a JPEG thumbnail (max 640px) and exports one .zip with references/. The zip writer is Luci's own stored-only writer (no fflate): pictures are already compressed, so no dependency is needed. Original image files are not copied (level 3 declined).

- Date: 2026-11-13
- Status: accepted
- Area: capture

## What
Images are selectable with a new Image tool that records only how an image is shown (kind, size, aspect ratio and the source ratio, fit, position, corners incl. a clipping wrapper, shadow, filters, mask, overlays); every url(...) is written <image>, so no URL or pixels reach a file (FR21). Any pick of an element can add a reference screenshot (FR22): full PNG downloaded beside the file and named in a new optional frontmatter field `reference`; the basket keeps a JPEG thumbnail (max 640px) and exports one .zip with references/. The zip writer is Luci's own stored-only writer (no fflate): pictures are already compressed, so no dependency is needed. Original image files are not copied (level 3 declined).

## Why
User chose image capture levels 1+2 and a .zip basket export on 2026-11-13 and said go. PRD updated: goal 6, eligibility table, FR1, FR4, new FR17a, FR19, FR22, success measure, decision "Images". Format: token/image (sections Image, Treatment, Overlays, Use, Where used), meta.reference, collection group Images.

## Alternatives considered
_Not recorded._
