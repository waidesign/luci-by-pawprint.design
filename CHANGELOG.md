# Changelog

All notable changes to Luci will be documented in this file.

## 0.6.0 (not released yet)

### Highlights
- **Team Feedback:** reviewers leave notes on a live or staging site in the Chrome extension's new **Team Feedback** tab and send one review over Slack or email; the designer pastes reviews into the dev toolbar's **Builder** tab, which merges duplicates, places each note on its element, checks it against the project's design files and shows the exact text the agent will get. The agent sees roles, never names.
- **After-Edit Blink:** when the agent's edit hot-reloads, the elements you noted pulse once, with a before/after peek.
- **Storybook support** in the dev toolbar, the extension and `luci capture crawl`.
- **Notes sit exactly where you click**, in the dev toolbar and in Team Feedback.
- **New defaults:** DESIGN.md (Stitch) files and Smart units (rem for text and spacing, px for borders, radii and shadows).
- **Whole-page captures** add a `## Sections` blueprint of the page's bands.
- **84 fixes** from a full review: capture accuracy, the extension, the dev toolbar, the CLI and the MCP server, plus privacy and safety (below).

### Privacy & Safety
- **Project path stays private:** the toolbar's settings show the project's folder name and `luci serve`'s address, never the full path on disk, because the page Luci runs on can read the toolbar's text.

### CLI & Packaging
- **Storybook support (`--storybook`):** `luci toolbar --storybook` installs/removes the dev toolbar in `.storybook/preview-body.html` (also auto-detected when no app root file is present); `luci capture crawl <url> --storybook` discovers stories from `/index.json` (Storybook v7/v8) or `/stories.json` (v6) and crawls each story canvas (`/iframe.html?id=<id>&viewMode=story`).
- **`luci capture crawl` without monorepo:** Ships pre-bundled `luci-capture.js` inside `@luci-dev/brain/dist/`, allowing `luci capture crawl` to run for npm users without runtime `esbuild` or monorepo paths (`B-71`).
- **Stitch flag requirement:** `crawl` only writes root `DESIGN.md` when `--stitch` is explicitly passed, and refuses to overwrite an existing root `DESIGN.md` without `--force` (`B-73`).
- **Missing Chromium hint:** Displays a direct command hint (`npx playwright install chromium`) when Playwright browsers are missing (`B-71`).
- **Safe crawl URLs:** Restricts crawling strictly to `http` and `https` protocols, rejecting `file:` and `data:` schemes (`B-72`).
- **Skills category validation:** `skills add` validates skill category paths against directory traversal (`..`) and retains custom git branches when importing from GitHub repositories (`B-85`).

### Chrome Extension & Dev Toolbar
- **After-Edit Blink:** Automatically highlights noted Feedback elements and auto-rechecked Design Check components with a calm ~900ms pulse ring and fading status pill when HMR/code edits change their styles, size, or text (ignoring user clicks/typing and respecting `prefers-reduced-motion: reduce`), adds a **Jump** chip when an updated element is off-screen, includes a non-destructive **Blink before/after** peek toggle that cleanly restores original inline styles, and adds an **After-Edit Blink** on/off setting in Dev Settings (on by default).
- **Storybook canvas awareness & story-scoped routes:** Clicking Luci's extension icon on a Storybook manager page automatically injects the toolbar into the preview canvas iframe (`#storybook-root`), and Feedback notes & Design Check auto-rechecks preserve `?id=<storyId>` on `/iframe.html` while stripping all other query params so notes stay isolated per story.
- **Smart units (`rem / % / px`) as default:** Adds a **Smart** unit mode (default in the toolbar and settings) that formats text (`font-size`, `line-height`) and spacing (`padding`, `margin`, `gap`) in `rem`, preserves authored fluid layout units (`%`, `vw`, `vh`, `auto`), and keeps borders, outlines, radii, shadows, and `letter-spacing` in `px` — supported across Luci tables, `DESIGN.md (Stitch)`, Tailwind, and CSS Variables exports.
- **DESIGN.md (Stitch) as default file format:** Sets **File** to **DESIGN.md (Stitch)** by default for preview, copy, download, and basket export (users can switch to **Luci tables**, Tailwind, or CSS Variables anytime; **Save to project** and **Make it a rule** continue to keep Luci's `.design.md` tables).
- **Uninitialized project warning:** When `luci serve` runs in a folder without `.luci/`, Settings displays an amber status dot with: `"Connected, but this folder isn't set up for Luci. Run \`luci init\` in your project folder."` (`B-39`).
- **Localhost bridge restriction:** Bridge connection URL is strictly restricted to local addresses (`http://127.0.0.1:<port>`, `http://localhost:<port>`) (`B-39`).
- **Responsive capture resilience:** Responsive capture handles Chrome debugger detach cleanly without wedging subsequent captures on that tab (`B-39`).
- **Export format safety:** When the export format is set to Tailwind or CSS Variables, "Save to project" and basket downloads preserve Luci's `.design.md` files; feedback notes are never written into exported CSS files (`B-29`).
- **Design Check diff overlay:** Visual diff overlay mounts outside `.shell` for proper Difference blend mode rendering and survives automatic rechecks without resetting loaded images (`B-33`).

### Team Feedback & Layout
- **Team Feedback:** the extension opens with **Capture** and **Team Feedback** tabs. Reviewers enter a name and a role (PM, Client, Designer, Developer, Stakeholder) once, annotate pages, and copy one review: readable text plus a compact `luci-review` block with each note's anchor and measured values. The dev toolbar's **Builder** tab imports one or many reviews, merges duplicates across reviewers, filters by role, places notes by selector, text, component and position (asking when unsure), checks them against component captures and the project's baseline tokens, and previews the role-only prompt before adding the notes.
- **Markers at the click point:** a note's marker sits where you clicked inside the element, after a reload too (`target.point`, `anchor.point`); older notes keep the top-right corner. Markers from the previous page no longer linger after an in-app navigation.
- **Review field sanitization:** All anchor and path fields (selector, element, component, route) in pasted reviews are sanitized to single-line text with code fences and markdown headings stripped, preventing prompt injection into agent prompts (`B-54`).
- **Note URL privacy:** Reviewer notes strip URL query strings and fragments, and normalize `file://` paths to prevent leaking sensitive session IDs or local machine paths (`B-41`).
- **Triage state persistence:** Team Feedback Builder triage state (dismissed items, confirmed items, selection, role filters) is preserved across component unmounts and element picking (`B-55`).
- **Windows path resolution:** Source file resolution preserves Windows drive letters (`C:`, `E:`) for Vite, Vue SFC, Svelte, and React 18 apps (`B-48`).
- **Layout mode unit safety:** Layout Preview spacing tokens only attach to px lengths, never unitless values (`flex-grow`), `%`, or `rem` (`B-61`).
- **Design check reconciliation:** Design Check auto-resolution requires matching element selector and normalized route before resolving notes (`B-67`).

### Capture Engine & Whole-Page Analysis
- **Whole-page `## Sections` blueprint:** Whole-page `.design.md` captures include an optional `## Sections` table right after `## Spacing` and before `## Components`, mapping each vertical page band (`header`, `hero`, named `#id` sections, `section-2`…, `footer`) to its layout/surface and the component variants it uses, without duplicating component tables.
- **Cleaner whole-page component output:** Whole-page `.design.md` captures omit empty component subsections (`Tokens`, `States`, `Motion`, `Accessibility`, `Variants`) when there is nothing to report, keeping standalone component files unchanged for Design Check compatibility.
- **Authored & token values in tables:** Colors and Spacing tables populate dominant Authored and Token values (showing token name if authored value is a variable) (`B-03`).
- **Collapsed sibling anatomy:** Visually identical sibling parts in component Anatomy and Accessibility are collapsed into a single representative entry with count (e.g. `link (×3)`) (`B-09`).
- **Canonical component selection:** Canonical component selection prioritizes text-bearing elements and larger variant groups for cleaner, more representative captures (`B-12`).
- **Image overlay contrast check:** Contrast for text on semi-transparent overlays over images reports "Check by eye — text is over an image" instead of an automatic hard fail (`B-14`).
- **Composite form accessibility:** Component accessibility accurately resolves deeply nested interactive fields and actions in composite forms and headers (`B-15`).
- **Scoped custom properties:** Custom CSS properties declared on `body`, theme scopes, and elements resolve correctly without leaking or disappearing (`B-18`).
- **Screen-reader element exclusion:** Visually hidden elements (`.sr-only`, `clip`, `clip-path`) are excluded from visible element sets while preserving accessible names (`B-19`).
- **Non-destructive state checking:** Capturing stylesheet rules respects `sheet.disabled` and preserves existing `aria-disabled` attributes without leaving page state mutated (`B-20`).
- **Shadow DOM & modern CSS media:** Responsive analysis supports shadow DOM selector traversal (`>>`), adopted stylesheets, CSS range media syntax (`(width >= 768px)`), and browser zoom adjustments (`B-21`).
- **Inline text recursion:** Whole-page section capture recurses into children of text-bearing elements, capturing inline links and styled text spans (`B-22`).
- **Icon recognition:** Icon identification distinguishes Lucide plus, minus, and arrow-right icons and prevents false Radix matches (`B-23`).
- **Font stack analysis:** Font analysis detects loaded font faces from the full font stack and parses multiple Google Font families in `<link>` tags (`B-24`).
- **Eyedropper scale & token priority:** Eyedropper scale accounts for scrollbars via `clientWidth`, and component color sets prioritize tokened authored values (`B-25`).
- **Background shorthand tokens:** `background: var(--token)` CSS shorthand reliably captures `background-color` and includes the token in Anatomy and Tokens (`B-01`).
- **Shadcn bare-channel HSL tokens:** Color analysis detects bare-channel HSL tokens (e.g. `20 14.3% 4.1%`) wrapped in `hsl(var(...))` and filters out internal `--tw-*` plumbing and unused library variables (`B-02`, `B-04`).
- **Centering margins:** Centering margins (`margin: auto`) are excluded from spacing scales, base unit calculation, and outliers (`B-05`).
- **Typography classification:** Headings with inline wrappers (such as links or badges) are named by their heading tag, line-height variants fold together, and fine print is classified as captions (`B-06`).
- **Component classification accuracy:** Card classification identifies only bounded containers as cards, avoiding false positives on full-width bands, paragraphs, table cells, or small icons (`B-07`, `B-08`).
- **Input field identification:** Form input fields nested inside container wrappers are named `field` rather than `decoration` (`B-10`).
- **State diff filtering:** Filters out false-positive stylesheet diffs like `transparent → initial` and duplicate shadows (`B-11`).
- **Fluid width reporting:** Unreadable cross-origin stylesheets report authored/fluid widths rather than fixed viewport-literal pixel dimensions (`B-13`).
- **Typography role hierarchy and weight naming:** Typography role names are numbered strictly by descending font-size order across headings (`heading-1`, `heading-2`, `heading-3`...) and body sizes (`body-large`, `body`, `body-small`, `caption`); same-size variants that differ only by font-weight are named by weight (e.g. `body-small-semibold`, `label-bold`), and numerical suffixes (`-2`) are reserved only for variants differing by more than weight.
- **Responsive capture:** Multi-column grids collapsing to single columns on mobile viewports are accurately captured in responsive analysis (`B-17`).
- **Custom root font size:** Custom root font sizes other than 16px are respected in `rem` conversions across capture and Design Check (`B-27`).

### Export Formats & Design Check
- **Component icon parsing:** Component capture reading correctly handles SVG icon metadata (`lucide "check"`) without corrupting component parts or style attributes in Design Check and Compare (`B-32`).
- **Valid token exports:** Token exports (`tokens.css`, `theme.css`, `tailwind.config.js`) emit valid CSS identifiers (converting decimal numbers like `1.6` to `1-6`), strip query strings and fragments from source URLs to protect session tokens, and align Tailwind v3 configuration formatting (`B-28`).
- **Stitch export transforms & grid tracks:** Stitch export respects `source: none`, accurately formats CSS transforms (`rotate()`, `scale()`), sanitizes `initial` color values, and counts grid columns with nested functions (`minmax()`) (`B-30`).
- **Design Check `em` distinction & box-shadow:** Design Check keeps `em` units distinct from `px`/`rem`, and canonicalizes multi-layer `box-shadow` values before comparison (`B-34`).
- **Symmetric comparison & duplicate part handling:** Component comparison disambiguates duplicate part and color names, compares array lists by value, and reports accessibility differences symmetrically (`B-35`).
- **Typography merge color separation:** Typography merge styling keys exclude color to keep typography scale independent of color tokens, and preserve authored values (`B-36`).
- **Remap tool refresh & bare HSL support:** Token remap tool resets state on new captures, maps CSS property names to `usedFor`, supports shadcn-style bare HSL tokens, and re-renders formatted markdown (`B-37`, `B-38`).

### MCP Server
- **Project path verification:** Tool execution verifies that `projectPath` exists and is a valid directory, preventing errors or accidental root initialization (`B-88`).
- **Home directory privacy:** MCP error messages sanitize system home paths, returning relative project paths (`B-89`).
- **Numerical timestamp comparison:** `watch_feedback` compares timestamps numerically (fixing same-second fractional ISO strings) and stops immediately on `AbortSignal` cancellation (`B-90`).
- **Tool safety hints:** Declared `openWorldHint: true` on `crawl_site_design` for client safety awareness (`B-91`).
