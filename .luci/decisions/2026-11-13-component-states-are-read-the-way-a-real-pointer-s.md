# Component states are read the way a real pointer sets them: hover/active on the component and every element around it (trigger named), focus on the element that takes it, every element inside watched, a real pointer as fallback; files show readable movement, per-part motion and honest labels

- Date: 2026-11-13
- Status: accepted
- Area: Capture

## What
Component states are read the way a real pointer sets them: hover/active on the component and every element around it (trigger named), focus on the element that takes it, every element inside watched, a real pointer as fallback; files show readable movement, per-part motion and honest labels

## Why
User report 2026-11-13 (lattice.com, then evernote.com "Make the most of your ideas" cards): states showed "not detected". Probes in headless Chromium found: (1) Tailwind group-hover, the hover is written on the link around the card; Luci forced :hover on the picked element only, while a real pointer hovers every ancestor. (2) Changes on elements that are not "parts" (decorative divs/spans: an arrow, a shadow layer, a highlight) were never read. (3) Hovers done in JavaScript are not seen by forcing. (4) 9 of 30 lattice components have no hover, but the label suggested failure. The user approved all seven fixes ("Do all the good things"). Now: readStatesViaCdp forces hover/active on the component and up to 12 marked ancestors (data-luci-state-up), then finds the trigger level by adding one ancestor at a time; focus/focus-visible go to the element that takes focus (focusDepthOf, up to 4 levels) with :focus-within above; when forced hover changes nothing, Input.dispatchMouseEvent moves a pointer onto a visible point of the component (pointerPointOf, not under Luci's panel), waits until values settle (300ms, at most 1.5s, 0.5s when nothing moves) and moves it back to Luci's panel. The rules reader also applies rules whose state is on an ancestor. stateParts watches every element inside (depth 6, at most 60, hidden ones too). Format additions (approved): state.trigger {element, selector, depth}, method "pointer", not-detected states keep their method ("No change" when checked in the browser, "Not in the stylesheets" for rules), anatomy appearsIn, motion part. Formatting: matrix() to translate/rotate/scale, invisible shadow layers dropped, color(srgb) colors converted, Chrome's auto outline marked as the default focus ring. Parts outside the anatomy are renumbered from the anatomy's own numbers. Speed: marked elements found by selector instead of sending the whole DOM tree, forces sent in parallel: evernote card 1.4s, lattice components 2.5-5.6s. New fixture site "states" copies both sites' patterns.

## Alternatives considered
_Not recorded._
