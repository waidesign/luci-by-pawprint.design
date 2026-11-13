# Layout mode resize handles grow the element on the dragged side: at drag start the preview keeps the opposite edge (LayoutPreview.keepEdge, relative to the parent box) and shifts the element with translate after the new size is laid out; set changes for width/height get grow left-right-up-down, printed as growing to the left (its right edge stays where it is). Insert placeholders do the same across their parent axis (nudge). After Copy prompt or Add to Feedback notes, the panel explains why the page went back (preview only, code unchanged until the agent edits it) and a strip under the bar says the changes are not lost.

- Date: 2026-11-13
- Status: accepted
- Area: feedback

## What
Layout mode resize handles grow the element on the dragged side: at drag start the preview keeps the opposite edge (LayoutPreview.keepEdge, relative to the parent box) and shifts the element with translate after the new size is laid out; set changes for width/height get grow left|right|up|down, printed as growing to the left (its right edge stays where it is). Insert placeholders do the same across their parent axis (nudge). After Copy prompt or Add to Feedback notes, the panel explains why the page went back (preview only, code unchanged until the agent edits it) and a strip under the bar says the changes are not lost.

## Why
User found the left handle only grew the element to the right on their dev server (CSS grows a box toward its end side whatever sets the width; centered boxes grow both sides). They rejected an Agentation-like box-only mode and Alt-drag: they want real visual feedback on the live page, growing where they drag, and a notice of why the preview resets.

## Alternatives considered
_Not recorded._
