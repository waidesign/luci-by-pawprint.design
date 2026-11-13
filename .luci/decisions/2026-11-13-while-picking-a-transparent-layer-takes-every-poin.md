# While picking, a transparent layer takes every pointer event, so the page never reacts; the element under the pointer is found by position

- Date: 2026-11-13
- Status: accepted
- Area: Capture

## What
While picking, a transparent layer takes every pointer event, so the page never reacts; the element under the pointer is found by position

## Why
User report 2026-11-13: picking a button on a real site clicked it and navigated away. The picker blocked page events with document listeners, but sites react earlier or elsewhere (mousedown handlers, window-level capture listeners that run before document ones, pointer-up "tap" handlers, form submits). Now a full-screen pick-layer (below Luci's bar and panels) receives all pointer input while a tool is picking; elementAt() finds the deepest page element at the point with elementsFromPoint, entering open shadow roots and skipping Luci's UI; the wheel is passed to the page's own scroll areas; after scrolling the picker re-aims. Pointer and click events on Luci's UI also stop at the toolbar so page handlers (e.g. "click outside closes the menu") never react. A traps fixture page (navigate on press, window-level click, form submit, navigate on pointer-up, an inner scroll area) proves all four are picked, the URL stays, and no event reaches a page element. Tests click page elements with Playwright's force option, since the layer is on top as intended.

## Alternatives considered
_Not recorded._
