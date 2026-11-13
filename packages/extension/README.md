# Luci extension

The capture toolbar on any site, for Chrome (Manifest V3, built with WXT).

## Build and load

1. `pnpm --filter @luci/extension build` (needs Node 22 or later; the `luci` command itself runs on Node 18).
2. In Chrome, open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and pick `packages/extension/.output/chrome-mv3`.
3. On any page, click Luci's icon. The toolbar opens at the top right; click the icon again to close it.

## Use

- **Component, Text, Colour, Spacing:** pick a tool, hover the page (the label shows the tag and size), and click.
- **Component states:** hover, focus, focus-visible and active are read exactly through Chrome's debugger. Chrome shows a "debugging this browser" bar for that moment only; Luci detaches straight after. Disabled is read by setting the attribute for an instant. A state done in JavaScript shows "Not detected": choose it under **State**, press **Capture current state**, and hover, focus or press the component during the 3-second countdown.
- **Keys:** ArrowUp widens the pick to the parent, ArrowDown narrows it back, Enter picks, Esc cancels.
- **Images can't be picked:** `img`, `picture`, `video`, `canvas` and photo backgrounds are greyed out with the reason.
- **Two outputs:** after a pick, choose **This one** (the item) or **The whole system** (typography, colours or spacing for the page).
- **Spacing extras:** hover shows padding and margin overlays. Drag from one element to another to measure the distance between them.
- **Hints:** while a tool is picking, a strip under the bar says what to click and which keys work.
- **Colour extras:** the strip has two ways to pick: **Element** (click an element) or **Pixel** (Chrome's eyedropper, for any spot on the screen). A pixel that matches a colour on the page resolves to its token; otherwise it is marked estimated.
- **Preview:** the units (px, rem, both) and colour format (hex, rgb, hsl, oklch) settings change the preview at once and are remembered. **Copy** or **Download .design.md**.

## Permissions

`activeTab`, `scripting`, `storage` and `debugger` only: the toolbar runs only on the tab where you click the icon, settings stay in the extension's storage, and the debugger is attached only while a component's states are read. No host permissions, no scripts on every page, nothing sent anywhere.

## Tests

`pnpm test` builds the extension and checks its manifest. Loading it in Chromium and capturing through it runs with `pnpm test:extension`; it is opt-in because some sandboxed environments hang while Chromium loads any unpacked extension. The toolbar itself is tested in Chromium on five test sites by the capture package.
