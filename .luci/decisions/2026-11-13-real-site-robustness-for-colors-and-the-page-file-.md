# Real-site robustness for colors and the page file: every color read goes through parseColor (never throws); color tokens with names the format cannot hold are left out; a page file leaves out a part it cannot read and lists it under "Left out"

- Date: 2026-11-13
- Status: accepted
- Area: Capture

## What
Real-site robustness for colors and the page file: every color read goes through parseColor (never throws); color tokens with names the format cannot hold are left out; a page file leaves out a part it cannot read and lists it under "Left out"

## Why
User report 2026-11-13: Whole page on lattice.com failed with "Cannot read properties of undefined (reading 'type')". Reproduced in headless Chromium with the user's permission. Cause 1: culori's parse throws (instead of returning undefined) on values like "drop-shadow(0 0px 1px rgb(0 31 31 / 24%)) ..." (lattice.com's --shadow-image); colorSystem asks it about every :root custom property. Now values.ts parseColor wraps parse, and color.ts, states.ts and the format helpers use it. Cause 2 (found on retry): Webflow leaves deleted variables named "--color--sand-100<deleted|variable-...>"; the format's token names are --[\w-]+, so the file failed its check. colorSystem now skips such names (format unchanged). Safety net (approved plan): pageCapture checks each system and component against its schema and leaves out what fails, in an optional "skipped" list written as a last "## Left out" section; the toolbar logs any error to the console and shows the first format problem, not the JSON. The css-variables fixture now has both kinds of :root property. lattice.com now gives a 895-line page file with 13 component kinds and nothing left out. Possible later change (needs the user's OK, a format change): allow any custom property name in the format.

## Alternatives considered
_Not recorded._
