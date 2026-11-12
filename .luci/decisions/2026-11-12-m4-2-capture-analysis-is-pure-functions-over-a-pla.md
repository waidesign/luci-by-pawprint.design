# M4.2: capture analysis is pure functions over a plain page snapshot, in the new browser-safe package @luci/capture

- Date: 2026-11-12
- Status: accepted
- Area: Capture

## What
M4.2: capture analysis is pure functions over a plain page snapshot, in the new browser-safe package @luci/capture

## Why
The DOM reader (M4.3) builds a PageSnapshot (tag, role, selector, box, visibility, own text, computed styles, authored values, browser-default flags); eligibility, Text, Colour and Spacing only read it, so they are unit-tested on plain data and identical in both toolbar shells. Rules, all deterministic: images, video, canvas, embeds and url() backgrounds are blocked with a reason, the body redirects to the systems; a text style is family, size, weight, line height, letter spacing, style and transform (colour belongs to the colour system), and roles are named from the tags using it (heading-N, display, body, body-large/small, label, code, caption, numbered when repeated); colours with OKLCH chroma >= 0.06 are accents, neutrals take their role from the property; an eyedropper pixel matching an element colour resolves to it and its token, otherwise it is estimated; spacing skips browser defaults and gaps on non-flex/grid boxes, and the base unit is the largest of 16,12,10,8,6,5,4,3,2 that fits at least 85% of uses and 3 distinct values.

## Alternatives considered
_Not recorded._
