# Store capture demo

A fictional page ("Recipe Box") and a fictional project folder (`recipe-box`) for taking Luci's Chrome Web Store screenshots by hand. Nothing here is real: no names, paths, accounts or keys.

- `site/index.html`: the Recipe Box page. Its **Start** buttons have hover, focus-visible, active and disabled (`aria-disabled="true"`) styles, so **States in this file** lists them.
- `serve.mjs`: serves the page on `http://localhost:<port>` (default 8080), with no dependencies.
- `recipe-box/`: the demo project. Its own `.luci/` makes it a Luci project, so `luci serve` started inside it saves into `recipe-box/.luci/design/` (not the repository's `.luci/`). Saved captures stay out of git.

## Start it (Windows PowerShell, from the repository root)

Build once if `packages/cli/dist` is missing: `pnpm build`.

Terminal 1, the page:

```powershell
node .luci\store-assets\kit\demo\serve.mjs 8080
```

Terminal 2, the bridge for `recipe-box` (port 4546, so it never meets another `luci serve` on 4545):

```powershell
cd .luci\store-assets\kit\demo\recipe-box
node ..\..\..\..\..\packages\cli\dist\bin.js serve --port 4546
```

In Chrome, open `http://localhost:8080/`, click Luci's icon, open **Settings** and set **Bridge** to `http://127.0.0.1:4546`. Put it back to `http://127.0.0.1:4545` (or empty) afterwards. Stop both terminals with Ctrl+C.

## The five captures

Window content 1136 x 596 at device pixel ratio 2 (DevTools device toolbar, Responsive, 1136 x 596, DPR 2). Settings, **Panel position: Left** keeps Luci's panel at the top left.

1. `1-capture.png`: Component tool, click the **Start** button under Family, **This one**, then scroll the panel to **The file** (its Tokens table).
2. `2-tokens.png`: Colour tool, click the heading, **The whole system**, set **File** to **CSS Variables (tokens.css)**, scroll to **The file**. Set **File** back to **Luci tables** afterwards.
3. `3-basket.png`: add three picks to the basket (the Start button, the colour system, the Text tool's whole system), then open **Basket**.
4. `4-states.png`: after the Start button capture, scroll the panel to **States in this file** (default, hover, focus-visible, disabled).
5. `5-local.png`: in the basket, **Send all to project**: "Saved 3 captures into recipe-box/.luci/design/."

Keep **Settings** out of the screenshots: its Connected project card shows the full folder path on your computer.
