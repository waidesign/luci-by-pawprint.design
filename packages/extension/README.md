# Luci extension

The capture toolbar on any site, for Chrome (Manifest V3, built with WXT).

## Build and load

1. `pnpm --filter @luci/extension build` (needs Node 22 or later; the `luci` command itself runs on Node 18).
2. In Chrome, open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and pick `packages/extension/.output/chrome-mv3`.
3. On any page, click Luci's icon. The toolbar opens at the top right; click the icon again to close it.

## Use

- **Three steps:** pick a tool, hover the page (the label shows the tag and size) and click; then adjust the selection; then choose an output.
- **Adjust the selection:** after the click the element stays selected. **↑ Wider** selects the element around it, **↓ Narrower** the one inside it (the ↑ ↓ keys do the same; Enter takes **This one**).
- **Component, Text, Color, Spacing:** the four tools; each says what to click in the strip under the bar.
- **Component states:** hover, focus, focus-visible and active are read exactly through Chrome's debugger, the way a real pointer sets them: hover and press on the component and every element around it (so Tailwind's `group-hover` cards are read, with the link that triggers them named), focus on the element that takes it, every element inside the component watched (an arrow that fades in, a shadow layer), and, when forcing finds no hover, a real pointer moved onto it so hovers done in JavaScript are read too. Chrome shows a "debugging this browser" bar for that moment only; Luci detaches straight after. Disabled is read by setting the attribute for an instant. The panel lists every state with ✓, "no change" (checked, nothing changes) or "not detected" (Luci could not be sure). Under **Capture by hand**, **All missing states** is chosen: press **Capture them**, then put the component in each state Luci names (hover, focus or press it) during its 3-second countdown. Clicks on the page do nothing meanwhile, so a link or button does not navigate.
- **Keys:** ↑ ↓ widen or narrow (while hovering too), Enter picks, Esc cancels.
- **Images can't be picked:** `img`, `picture`, `video`, `canvas` and photo backgrounds are greyed out with the reason.
- **Two outputs:** choose **This one** (the item) or **The whole system** (typography, colors or spacing for the page; for a component, its variants). The panel says what each gives for the current tool.
- **Spacing extras:** hover shows padding and margin overlays. After a click, **All** (the default) takes every padding, margin and gap of the element in one file; click one value to take only that. Drag from one element to another to measure the distance between them.
- **Whole page:** one file for the current page: its typography, colors and spacing, plus every kind of component on it (buttons, links, fields, cards, navigation...) with their variants and the states its stylesheets give them.
- **Hints:** while a tool is picking, a strip under the bar says what to click and which keys work.
- **Color extras:** the strip has two ways to pick: **Element** (click an element) or **Pixel** (any spot on the page). In Pixel mode, hover the page to see the color under the pointer and click to pick; over Luci's own bar and panels nothing is picked, and picking carries on when you move back onto the page. Esc goes back to Element. A pixel that matches a color on the page resolves to its token; otherwise it is marked estimated.
- **Basket:** after any capture, **Add to basket**. **Basket (n)** in the bar lists everything you collected, on any page or site, until you empty it. Rename an item by editing its name, **Export** one item, **Remove** it, or **Export all as one file**: one `.collection.design.md` grouped by kind, each item with its source page.
- **Your instructions for the agent:** under every capture, a box for how you want the agent to use or change it ("use this as our primary button, but with our brand blue"). It is saved in the file word for word, as the first section.
- **Edit the file:** the preview can be edited. Copy, Download and Add to basket use exactly what you see; **Undo my edits** goes back to the generated file.
- **Preview:** the units (px, rem, both) and color format (hex, rgb, hsl, oklch) settings change the preview at once and are remembered. **Copy** or **Download .design.md**.

## Permissions

`activeTab`, `scripting`, `storage` and `debugger` only: the toolbar runs only on the tab where you click the icon, settings stay in the extension's storage, and the debugger is attached only while a component's states are read. No host permissions, no scripts on every page, nothing sent anywhere.

## Tests

`pnpm test` builds the extension and checks its manifest. Loading it in Chromium and capturing through it runs with `pnpm test:extension`; it is opt-in because some sandboxed environments hang while Chromium loads any unpacked extension. The toolbar itself is tested in Chromium on five test sites by the capture package.
