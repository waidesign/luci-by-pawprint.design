# Layout mode step 3 (FR32): New page sketches a page on a full-window canvas in Luci's shadow root: route, rows top to bottom, 1-12 blocks per row with span shares (dragging the line between two blocks moves span between them), each block a part (component, capture, block) or an area with a label; heights snapped to the page base unit; own undo/redo. Output: formatWireframePrompt (numbered parts, 2a/2b for rows), or a Feedback note with item field wireframe { route, viewport, rows[{ height, blocks[{ what, label, span }] }] } and target body.

- Date: 2026-11-13
- Status: accepted
- Area: feedback

## What
Layout mode step 3 (FR32): New page sketches a page on a full-window canvas in Luci's shadow root: route, rows top to bottom, 1-12 blocks per row with span shares (dragging the line between two blocks moves span between them), each block a part (component, capture, block) or an area with a label; heights snapped to the page base unit; own undo/redo. Output: formatWireframePrompt (numbered parts, 2a/2b for rows), or a Feedback note with item field wireframe { route, viewport, rows[{ height, blocks[{ what, label, span }] }] } and target body.

## Why
User said go for steps 2 and 3. One level of rows and columns (no nesting) keeps the sketch quick and the prompt readable; the part picker is shared with Insert (ui/parts.tsx). The sketch starts from navigation, section, footer.

## Alternatives considered
_Not recorded._
