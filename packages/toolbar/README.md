# Luci dev toolbar

Luci inside your own app while you develop it: leave notes on the running app for your coding agent (Feedback), or capture components, text, colors and spacing (Capture). Notes and saved captures go into the project's `.luci/` folder, where the agent reads them through `luci-mcp`.

## Set up

1. In the project: `luci init` (once), then `luci serve`. It prints the line to add.
2. Add it to your app while developing, in `index.html` or the root layout:

   ```html
   <script src="http://127.0.0.1:4545/toolbar.js"></script>
   ```

3. Optional: connect your agent to `luci-mcp` (for example `claude mcp add luci -- node <luci>/packages/mcp/dist/bin.js`), so it can read the notes and saved captures itself. Copying the prompt works without it.

`luci serve` listens on 127.0.0.1 only and answers pages on this machine only. Without it, the toolbar still works: notes stay in this browser (for this app's address) and the prompt can be copied. The **This browser** badge says why it is not connected; click it after starting `luci serve`.

## Feedback

- **Annotate:** click an element, write what should change, choose the intent (fix, change, question, approve) and priority. Hover shows the element and its React component. Esc stops.
- **Text:** select words on the page (outside Annotate) and press **Add feedback**.
- **Markers:** each note is a numbered marker on its element: filled when new, outlined once copied, green with ✓ when you marked it done. Click one to **Mark done** (or **Reopen**), edit it (text, intent and priority) or delete it.
- **Copy prompt:** the notes as one prompt, grouped by page with stable IDs (`P2-A3`) and a request to report every ID. It copies the new notes (**Copy prompt (2 new)**), or every note not done yet when all were copied before (**Copy prompt (all 4)**); **▾** chooses. Paste it to your agent and read its report.
- **You decide what is done:** no agent changes your notes. After checking the agent's work, mark notes done one by one, or press **Mark all copied as done** in Notes. Over MCP, the agent can only read the notes (`list_feedback`, `get_feedback_prompt`).
- **Watch mode:** ask your agent to "watch for my feedback". It calls `watch_feedback`, which waits until you add notes, gives it only the new ones as one prompt, and is called again for the next batch. Your notes stay New until you copy or mark them.
- **Notes:** every note, page by page, with tabs **Not done · Done · All**. Open a row for its file and line, components and actions; **Clear done** removes the notes you marked done. **Delete all notes** is under ⚙.
- **Pause:** freezes the page's animations, transitions and videos on the current frame.
- **Settings:** marker color, prompt detail (compact: selector and text; standard: + source file and components; detailed: + computed styles), and an optional webhook that receives the prompt and the items when you press **Send to webhook**.

With React in development mode, each note records the components around the element (`App > Pricing > PlanCard`) and the file and line of its JSX, read through the dev server's source maps. In a production build, notes keep the selector and text.

## Modes

The switch first in the bar, **Feedback · Layout · Capture**, is in the same place in every mode.

## Layout

Try layout changes on the live page, then copy them as one prompt for your agent.

- **Select** an element (**↑ Parent** takes the one around it). Drag any of its 8 handles (sides and corners) to resize it, on the side you drag (the left handle grows it to the left and keeps its right edge where it is, even when the page centers it), or the **⠿** grip above it to move it among its neighbors; a pink line shows where it lands. Orange and green show its margin and padding.
- **Size:** width, height, min and max width and height. These are sizes on screen, border and padding included. Type a number (px) or `none`, `auto`, `50%`, `20rem`.
- **Spacing:** margin and padding for each side, with − and +; 🔗 changes all four sides together.
- **Layout of its children:** display (block, flex, grid, inline…); for flex, direction and wrap; for grid, the number of equal columns; justify, align, row gap and column gap.
- **In its parent** (when the parent is flex or grid): align self, grow, shrink.
- Values snap to the page's spacing scale and show the custom property that has the value (`--space-6`).
- Changes show on the real page at once. A move really reorders in a flex or grid container, and shifts into place in a top-to-bottom stack; when neither is possible, the prompt still says where it goes. **Undo**, **Redo** (Ctrl+Z, Ctrl+Shift+Z) and **Reset** put things back. Luci never moves your app's DOM, so your app keeps working.
- **Insert** adds a new part: **your components** found on the page (from React, most used first: "another PlanCard"), **saved captures** from `.luci/design/` (with `luci serve`), or a **block** (section, heading, text, button, image slot, card, card grid, navigation, footer, form field). Then click where it goes: near an element's top or bottom edge (left or right in a row) puts it before or after; the middle of a section, card or list puts it inside, at the end. With an element selected, **Before**, **After**, **Inside, start** and **Inside, end** place it next to that one. The new part is a dashed placeholder Luci draws (never put into your app's DOM); its neighbors shift to make room, and a top-to-bottom parent grows. Select it to say **what goes in it**, resize it with its handles or the size fields (**Full width** in a top-to-bottom stack), move it with **⠿**, or remove it (**Remove**, or Delete).
- **New page** sketches a page that does not exist yet, on a canvas over your app: type its route, then build it from rows top to bottom. Click a part to **choose what it is** (your component, a saved capture or a block; or leave it an area), say **what goes in it**, **split it in two**, or remove it. Drag a row's bottom handle to change its height (snapped to the page's scale) and the line between two parts to share the width. **+ Row**, **+ Row below**, **Move up**/**down**, **Undo**/**Redo** (Ctrl+Z). **Copy page prompt** gives the agent numbered parts top to bottom; **Add to Feedback notes** keeps the sketch as a note. **Back to the page** (or Esc) closes it.
- **Copy prompt:** every planned change on the page, element by element, with your note, in one prompt to paste to your agent. The page then goes back as it is in your code, and Luci says why: Layout mode only previews, and your code has not changed until your agent edits it. **Add to Feedback notes** keeps the plan as notes instead, to send with other notes in one multi-page prompt.

## Capture

**Capture** shows the capture tools of the browser extension (Component, Text, Color, Spacing, Whole page, Basket). **Save to project** writes a file, or a basket export, into `.luci/design/`; the agent lists them with `list_captures`.
