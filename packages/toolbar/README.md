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
- **Notes:** every note, page by page, with tabs **Not done · Done · All**. Open a row for its file and line, components and actions; **Clear done** removes the notes you marked done. **Delete all notes** is under ⚙.
- **Pause:** freezes the page's animations, transitions and videos on the current frame.
- **Settings:** marker color, prompt detail (compact: selector and text; standard: + source file and components; detailed: + computed styles), and an optional webhook that receives the prompt and the items when you press **Send to webhook**.

With React in development mode, each note records the components around the element (`App > Pricing > PlanCard`) and the file and line of its JSX, read through the dev server's source maps. In a production build, notes keep the selector and text.

## Modes

The switch first in the bar, **Feedback · Layout · Capture**, is in the same place in every mode.

## Layout

Plan layout changes on the live page, then send them to your agent as notes with exact steps.

- **Select** an element (**↑ Parent** takes the one around it). Drag its right edge, bottom edge or corner to resize it, or drag **⠿** to move it among its neighbors; a pink line shows where it lands.
- The panel sets width, height, gap (for flex and grid containers), padding and margins exactly, with − and + in steps of the page's spacing unit. Values snap to that scale and show the custom property that has the value (`--space-6`).
- Changes show on the real page at once. In a flex or grid container a move really reorders; elsewhere it is planned and the note says where it goes. **Undo**, **Redo** (Ctrl+Z, Ctrl+Shift+Z) and **Reset** put things back; leaving Layout mode removes the preview. Luci never moves your app's DOM, so your app keeps working.
- **Add as note** turns the element's changes into a note: the steps, the window width you planned at, and your "why". It gets a marker in Feedback mode and goes in the next prompt.

## Capture

**Capture** shows the capture tools of the browser extension (Component, Text, Color, Spacing, Whole page, Basket). **Save to project** writes a file, or a basket export, into `.luci/design/`; the agent lists them with `list_captures`.
