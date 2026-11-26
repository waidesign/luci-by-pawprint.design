# Luci extension

Luci on any site, for Chrome and Edge (Manifest V3, built with WXT). Click Luci's icon and choose a tab:

- **Capture:** read components, text, colours, spacing or a whole page as design files for your agent.
- **Team Feedback:** for reviewers (PM, client, designer, developer, stakeholder). Enter your name and role once, click elements on a live or staging site to leave notes (the number sits where you clicked), then **Review** copies one review to send to the designer over Slack or email. The designer pastes it into the dev toolbar's **Builder** tab. Notes stay in this browser until you clear them; the agent only ever sees your role, not your name.

On a Storybook page, the toolbar opens inside the story's canvas.

## Build and load

1. `pnpm --filter @luci-dev/extension build` (needs Node 22 or later; the `luci` command itself runs on Node 18).
2. In Chrome, open `chrome://extensions`, turn on Developer mode, choose **Load unpacked**, and pick `packages/extension/.output/chrome-mv3`.
3. On any page, click Luci's icon. The toolbar opens at the top right; click the icon again to close it.
4. To save into a project from your own build, start `luci serve --allow-extension <id>` with the ID Chrome shows under Luci in `chrome://extensions`. `luci serve` answers only the extension from the Chrome Web Store unless you allow another one.

## Use

- **Three steps:** pick a tool, hover the page (the label shows the tag and size) and click; then adjust the selection; then choose an output.
- **Adjust the selection:** after the click the element stays selected. **↑ Wider** selects the element around it, **↓ Narrower** the one inside it (the ↑ ↓ keys do the same; Enter takes **This one**).
- **Component, Text, Color, Spacing:** the four tools; each says what to click in the strip under the bar.
- **Component states:** hover, focus, focus-visible and active are read exactly through Chrome's debugger, the way a real pointer sets them: hover and press on the component and every element around it (so Tailwind's `group-hover` cards are read, with the link that triggers them named), focus on the element that takes it, every element inside the component watched (an arrow that fades in, a shadow layer), and, when forcing finds no hover, a real pointer moved onto it so hovers done in JavaScript are read too. Chrome shows a "debugging this browser" bar for that moment only; Luci detaches straight after. Disabled is read by setting the attribute for an instant. The panel lists every state with ✓, "no change" (checked, nothing changes) or "not detected" (Luci could not be sure). Under **Capture by hand**, **All missing states** is chosen: press **Capture them**, then put the component in each state Luci names (hover, focus or press it) during its 3-second countdown. Clicks on the page do nothing meanwhile, so a link or button does not navigate.
- **Keys:** ↑ ↓ widen or narrow (while hovering too), Enter picks, Esc cancels.
- **Images in components:** a component file has an **Images** section for each image inside it: an `img`, `video`, `canvas`, a picture inside an SVG drawing, or a background photo (a hero or card with one can be picked like any other element). Each row names the part (the same name States and Motion use, so a hover zoom on `image` reads with it) and says how the image is shown: size and shape (and the file's own shape when cropped), fit and position, corners (also when the card around it clips them), effects, and gradients or tints over it. Never the image, its address or its pixels: your agent puts its own images in the slots. A bare `img`, `picture`, `video` or `canvas` is greyed out and points to the component around it (**↑ Wider**).
- **Two outputs:** choose **This one** (the item) or **The whole system** (typography, colors or spacing for the page; for a component, its variants). The panel says what each gives for the current tool.
- **Spacing extras:** hover shows padding and margin overlays. After a click, **All** (the default) takes every padding, margin and gap of the element in one file; click one value to take only that. Drag from one element to another to measure the distance between them.
- **This section** (Component tool, v0.2): pick a section (↑ Wider until the whole section is selected), then **This section**: one section file with its layout, and one file for each kind of component in it (cards, buttons, fields...), each described once. **View** shows a component file; **Download .zip** saves them all in one archive.
- **Whole page:** one file for the current page: its typography, colors and spacing, plus every kind of component on it (buttons, links, fields, cards, navigation...) with their variants and the states its stylesheets give them.
- **How it changes by width** (v0.3): after a component or section capture, this reads it at 2 or 3 widths taken from the site's own media queries (for example 375, 768 and 1280px) and adds a **Responsive** table to the file: what changes at each width (padding, font sizes, the number of grid columns, a part that only shows at some widths) and the queries behind it. Luci resizes the tab through the debugger for each width (Chrome shows its "debugging this browser" bar for a moment) and puts it back.
- **Site systems** (v0.3): capture a system (Text, Color or Spacing, **The whole system**) on two or more pages of a site and add each to the basket; the basket then offers **Merge into site systems**. You get one site-level file per kind (`site-typography`, `site-color`, `site-spacing`): rows unified across pages, uses added up, a Pages column saying which pages use each row, and a Conflicts section for any role or token whose value differs between pages. The page systems stay in the basket.
- **Check** (v0.3): check a component that was built against its design file. Choose the design (a component in the basket, or a pasted file), click the built component, then **Check against the design**: Luci captures it the same way (states included) and lists what matches and each difference (styles part by part, parts, state changes, motion, accessibility levels that got worse), one sentence each. Untick what you accept and **Copy as a prompt** for your agent. In the dev toolbar the differences become Feedback notes instead.
- **Hints:** while a tool is picking, a strip under the bar says what to click and which keys work.
- **Color extras:** the strip has two ways to pick: **Element** (click an element) or **Pixel** (any spot on the page). In Pixel mode, hover the page to see the color under the pointer and click to pick; over Luci's own bar and panels nothing is picked, and picking carries on when you move back onto the page. Esc goes back to Element. A pixel that matches a color on the page resolves to its token; otherwise it is marked estimated.
- **Basket:** after any capture, **Add to basket**. **Basket (n)** in the bar lists everything you collected, on any page or site, until you empty it. Rename an item by editing its name, write a **note for your agent** under it (what to use it for, what to change; it goes into that item's file and its part of the export as "Your instructions"), **Export** one item, **Remove** it, or **Export all as one file**: one `.collection.design.md` grouped by kind, each item with its source page.
- **Your instructions for the agent:** under every capture, a box for how you want the agent to use or change it ("use this as our primary button, but with our brand blue"). It is saved in the file word for word, as the first section.
- **Edit the file:** the preview can be edited. Copy, Download and Add to basket use exactly what you see; **Undo my edits** goes back to the generated file.
- **Preview:** the units (Smart, the default: rem for text and spacing, px for borders, radii and shadows; or px, rem, both) and color format (hex, rgb, hsl, oklch) settings change the preview at once and are remembered. **Copy** or **Download**; **File** chooses DESIGN.md (Stitch, the default), Luci tables, Tailwind or CSS Variables.

## Permissions

`activeTab`, `scripting`, `storage` and `debugger`, plus two hosts: `http://localhost/*` and `http://127.0.0.1/*` only. The toolbar runs only on the tab where you click the icon, settings stay in the extension's storage, and the two hosts are only for sending captures to `luci serve` on your own computer. The debugger is attached only while a capture reads a component's states or other widths, and Luci's switch in settings turns its use on or off (while it is off, states come from stylesheet rules and widths from a hidden frame). No scripts on every page, nothing sent anywhere else.

## Tests

`pnpm test` builds the extension and checks its manifest. Loading it in Chromium and capturing through it runs with `pnpm test:extension`; it is opt-in because some sandboxed environments hang while Chromium loads any unpacked extension. The toolbar itself is tested in Chromium on five test sites by the capture package.
