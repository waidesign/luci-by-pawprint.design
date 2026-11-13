# M5.3: component states are read by the debugger (extension), from stylesheet rules (any shell), from the disabled attribute, or by hand; nothing is guessed

- Date: 2026-11-13
- Status: accepted
- Area: Capture

## What
M5.3: component states are read by the debugger (extension), from stylesheet rules (any shell), from the disabled attribute, or by hand; nothing is guessed

## Why
packages/capture/src/states.ts. Targets are the container and its parts. Before reading, targets are marked and their transitions and animations switched off inline (so values are final), and the exact style attribute is restored after (Chrome writes CSSOM changes to the attribute lazily, which left style="" until the attribute is read once and cssText cleared before removal). Forced: readStatesViaCdp forces :hover, :focus, :focus-visible, :active on the container through CSS.forcePseudoState and reads CSS.getComputedStyleForNode for every target; the extension background attaches the debugger only for that reading and always detaches. Rules: stylesheet rules (document and shadow roots, adopted sheets) whose state pseudo-class sits on the container, colours normalised to the browser form, then the same diff as forced. Disabled: disabled or aria-disabled set for an instant (buttons and fields only). The diff combines outline and border colours and drops invisible changes (an outline that stays none, a border side with no width). A state with no change is "not detected"; "Capture current state" with a 3-second countdown records it by hand. Text roles: on a tie, headings and body text win over labels, captions, code and links. Extension permissions are now activeTab, scripting, storage, debugger. Tested on the sites (rules), through a Playwright CDP session (forced), and the toolbar manual capture; the extension debugger test is opt-in (pnpm test:extension).

## Alternatives considered
_Not recorded._
