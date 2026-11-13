# Layout mode (FR32, step 1): plan layout changes on existing elements in the dev toolbar (resize by edges, move among siblings, gap, padding and margins), snapped to the page spacing scale with its token, previewed through one Luci stylesheet with data-luci-layout ids (React DOM never moved; order previews moves in flex and grid parents, elsewhere the move is planned only), undo, redo and reset; Add as note stores feedback item field `layout` {viewport, changes[move-set]} and the prompt prints the steps. Width and height are the size as rendered (preview uses box-sizing border-box).

- Date: 2026-11-13
- Status: accepted
- Area: feedback

## What
Layout mode (FR32, step 1): plan layout changes on existing elements in the dev toolbar (resize by edges, move among siblings, gap, padding and margins), snapped to the page spacing scale with its token, previewed through one Luci stylesheet with data-luci-layout ids (React DOM never moved; order previews moves in flex and grid parents, elsewhere the move is planned only), undo, redo and reset; Add as note stores feedback item field `layout` {viewport, changes[move|set]} and the prompt prints the steps. Width and height are the size as rendered (preview uses box-sizing border-box).

## Why
User asked for a Layout mode like Agentation but better and said "Go for it" to the plan (format change and new requirement approved). Steps 2 (insert own components, captures, blocks) and 3 (wireframe a new page) come later. Same round: mode switch [Feedback | Layout | Capture] on every bar, Copy prompt always available, edit intent and priority, Notes panel redesign.

## Alternatives considered
_Not recorded._
