# Luci dev toolbar

Luci inside your own app while you develop it: leave notes on the running app for your coding agent (Feedback), or capture components, text, colors and spacing (Capture). Notes and saved captures go into the project's `.luci/` folder, where the agent reads them through `luci-mcp`.

## Set up

1. In the project: `luci init` (once), then `luci serve`. It prints the line to add.
2. Add it to your app while developing, in `index.html` or the root layout:

   ```html
   <script src="http://127.0.0.1:4545/toolbar.js"></script>
   ```

3. Connect your agent to `luci-mcp` (for example `claude mcp add luci -- node <luci>/packages/mcp/dist/bin.js`).

`luci serve` listens on 127.0.0.1 only and answers pages on this machine only. Without it, the toolbar still works: notes stay in this browser (for this app's address) and the prompt can be copied. The **This browser** badge says why it is not connected; click it after starting `luci serve`.

## Feedback

- **Annotate:** click an element, write what should change, choose the intent (fix, change, question, approve) and priority. Hover shows the element and its React component. Esc stops.
- **Text:** select words on the page (outside Annotate) and press **Add feedback**.
- **Markers:** each note is a numbered marker on its element, showing its status: not sent, sent, the agent is on it (…), the agent asked a question (?), done (✓), not done (–). Click one to read the thread, answer a question, edit, reopen or delete it.
- **Copy prompt:** the new notes as one prompt, grouped by page with stable IDs (`P2-A3`) and a request to report every ID. Copied notes are marked as sent; **Include items already sent** copies them again. The agent can also fetch it with `get_feedback_prompt`.
- **Items:** every note, page by page; **Clear done** or **Clear all**.
- **Pause:** freezes the page's animations, transitions and videos on the current frame.
- **Settings:** marker color, prompt detail (compact: selector and text; standard: + source file and components; detailed: + computed styles), and an optional webhook that receives the prompt and the items when you press **Send to webhook**.

With React in development mode, each note records the components around the element (`App > Pricing > PlanCard`) and the file and line of its JSX, read through the dev server's source maps. In a production build, notes keep the selector and text.

## Capture

**Capture** switches to the capture tools of the browser extension (Component, Text, Color, Spacing, Whole page, Basket). **Save to project** writes a file, or a basket export, into `.luci/design/`; the agent lists them with `list_captures`. **Feedback** switches back.
