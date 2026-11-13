# Picking has three clear steps (hover and click, adjust the selection, choose an output), and Pixel mode reads a screenshot instead of the browser eyedropper

- Date: 2026-11-13
- Status: accepted
- Area: Capture

## What
Picking has three clear steps (hover and click, adjust the selection, choose an output), and Pixel mode reads a screenshot instead of the browser eyedropper

## Why
User feedback from Chrome on 2026-11-13. (1) After a click the panel appeared and ↑ ↓ no longer worked, although the hint promised them. Now the selection stays, highlighted, and the panel shows "Selected: <element> W × H" with ↑ Wider / ↓ Narrower buttons (and the keys; Enter takes This one), plus one line on what each output gives for the current tool; widening while hovering carries over. (2) The native EyeDropper covers the whole screen including Luci and cannot be limited. In the extension, Pixel mode now hides Luci, takes a screenshot (tabs.captureVisibleTab, allowed by activeTab), and lays a transparent layer under Luci's panels: hovering shows a swatch of the pixel, Luci's panels stay usable and pick nothing, picking resumes when the pointer returns to the page, a click picks, Esc goes back to Element, scrolling retakes the screenshot. The native eyedropper remains the fallback where no screenshot is available. (3) Two `pnpm test:extension` failures were the test helper injecting into an older tab with the same URL; it now uses the newest tab and closes its tabs. (4) A race found by repeated runs: adding to the basket before the stored basket had loaded could overwrite it; adds now start from the stored items. The background imports the state reader from @luci/capture/states (smaller bundle).

## Alternatives considered
_Not recorded._
