# Feedback format

Feedback is what a person pins on elements of their running app for an agent to apply (PRD FR23 to FR31). It has two forms: **items**, stored one JSON file each in `.luci/feedback/`, and the **prompt**, the Markdown text an agent receives. Schemas and the formatter are in `packages/format/src/feedback` (`@luci/format/feedback`, browser-safe). The golden files in `packages/format/fixtures/feedback/` are the reference for the prompt; their inputs are in `prompt-inputs.json`, and `node scripts/capture-goldens.mjs` rewrites them after a build. Review any change by eye before committing it.

## Items

One file per item, `.luci/feedback/<id>.json`. `luci serve` writes them for the toolbar; `luci-mcp` only reads them (the agent never changes a note). Each item is its own file and every write replaces the file in one step.

| Field | Content |
| --- | --- |
| `id` | The file's name: letters, digits, `-` and `_`. Never shown to agents |
| `ref` | The stable ID agents report on, `P<page>-A<n>` (FR27). A page's number is the order its route was first annotated in the session; `n` is the order on that page. A route keeps its number while any item on it remains, and numbers on a page are never reused |
| `page` | `url`, `route` (the path, plus a `#/...` fragment for hash routers; never the query), `title`, and `source`: the page component's file when an adapter (React, Vue 3, or Svelte 4/5) found it |
| `target` | `kind` (`element` or `text`), `selector`, `element` (tag and role, such as `h2 (heading)`), `text` (its visible text, shortened), `selectedText`, `components` (outermost first, from React, Vue or Svelte), `source` (`file`, plus `line` and `column` when the framework provides them), `styles` (a few computed values), `rect` (where it was, to place the marker again), `point` (where in the element the person clicked, `{ x, y }` as fractions of its width and height from 0 to 1, so the marker sits on that spot; added in 0.6.0, notes without it keep the marker on the top-right corner) |
| `reviewerRoles` | Optional, from Team Feedback: the roles of the reviewers who raised the note (`PM`, `Client`, `Designer`, `Developer`, `Stakeholder`), never their names |
| `comment` | What the person wrote |
| `intent` | `fix`, `change`, `question` or `approve` |
| `priority` | `high`, `medium` or `low` |
| `status` | Set by the person: `pending` (new), `sent` (copied in a prompt, FR29) or `resolved` (marked done). `acknowledged`, `question` and `dismissed` are from the earlier agent sync (removed 13 Nov 2026) and are still read, as copied, copied and done |
| `createdAt`, `updatedAt`, `sentAt` | ISO times in UTC |
| `thread` | From the earlier agent sync, on older notes only: questions and answers (`from`, `text`, `at`) |
| `resolution` | From the earlier agent sync, on older notes only: what the agent said it did |
| `layout` | Optional, from Layout mode: `viewport` (the window's `width` and `height` it was planned at) and `changes`, each either `{ op: "move", position: "before" \| "after" \| "first" \| "last", sibling: { selector, element }, from, to, of }` (its place among its siblings, 1-based) or `{ op: "set", property, from, to, token }`. Properties: size (`width`, `height`, `min-width`, `max-width`, `min-height`, `max-height`: sizes as rendered, border and padding included), spacing (`margin-*` and `padding-*` for each side; `padding` for all sides is from the first version), the element as a container (`display`, `flex-direction`, `flex-wrap`, `justify-content`, `align-items`, `gap`, `row-gap`, `column-gap`, `grid-template-columns`) and in its parent (`align-self`, `flex-grow`, `flex-shrink`). `token` names the page's custom property with that value; `grow` (`left`, `right`, `up`, `down`) says, for a width or height changed with a handle, the side it grew or shrank on while the other edge stayed where it was on screen, printed as `, growing to the left (its right edge stays where it is)`. Added 13 Nov 2026 (step 2): `{ op: "insert", what, position: "before" \| "after" \| "start" \| "end", width, height, label }`, a new part before or after the element, or inside it at the start or the end; `what` is `{ kind: "component" \| "capture" \| "block", name, file, example: { selector, element } }` (one of the app's components with its file and one on the page, a saved capture with its path in `.luci/design/`, or a generic block: `section`, `heading`, `text`, `button`, `image slot`, `card`, `card grid`, `navigation`, `footer`, `form field`); `width` and `height` are px as rendered, or `100%` for the full width; `label` is what goes in it |
| `wireframe` | Optional, from Layout mode's New page (step 3, added 13 Nov 2026): a page that does not exist yet. `route` (starts with `/`), `viewport`, and `rows` from top to bottom, each `{ height: "<n>px", blocks: [{ what, label, span }] }`: 1 to 12 blocks side by side, `what` as for an insert (left out for an area), `span` its share of the row (span over the row's spans). The item's target is the page it was sketched on (`body`) |
| `check` | Optional, from a design check (v0.3, added 14 Nov 2026): one difference between a built component and its design file. `design` (the file's path in the project, `.luci/design/...`, or its name), `part` (as the design file names it), `state` (for a change in a state), `property` (a CSS property, `transition <property>`, `part`, or an accessibility check such as `text contrast`), `expected` (as the design file writes it, with its token; `not set`, `none` or `no change` when it has none) and `actual` (as measured on the built component). The comment says the same in words; intent is `fix` |

## The prompt

```
# UI feedback: 3 pages, 6 items
Apply every item below, on all 3 pages. Do not stop after the first page.

## Page 1 of 3: /pricing  (src/pages/Pricing.jsx)
- [P1-A1] fix, high: "Button label wraps on mobile"
  selector: main > section:nth-of-type(2) > button
  text: "Start free trial"
  source: src/components/PlanCard.jsx:12:7
  components: App > Pricing > PlanCard
...

## When done
Report every item ID as done, skipped or blocked, grouped by page,
and name the route to open to verify it.
End with the number of items done out of 6.
```

- **Header:** the number of pages and items. With more than one page, the agent is told not to stop after the first.
- **Pages:** `## Page i of N: <route>  (<page source>)`, in page-number order. When a prompt leaves out a page (all its items done), the IDs keep the session's page number and the heading says so: `(item IDs start with P3)`.
- **Items:** `- [ref] intent, priority: "comment"` (a multi-line comment is joined with ` / `), then `selector:`, `selected text:` for a text selection, `text:` (or `element:` when it has no text). On older notes, questions and answers from the earlier agent sync follow as `you asked:` and `answer:`.
- **Layout notes:** after the element lines, `layout, planned in a 1280px wide window (keep it working at other widths):` and one step per change, such as `move it before \`nav > a:nth-of-type(1)\` (a): 3rd of 3 → 1st`, `padding 16px → 24px (--space-6)` or `insert another \`PlanCard\` (src/components/PlanCard.jsx; one is at \`main > section > div:nth-of-type(1)\`) after it, 320px wide, 240px tall as rendered: "Enterprise plan"` (golden `insert-and-new-page.standard.prompt.md`).
- **Design check notes:** after the element lines, `design check against .luci/design/<file>: container on hover, background-color: the design says #0353e9; built: #1d4ed8`, so the agent can open the design file (golden `design-check.standard.prompt.md`).
- **Detail level:** `compact` stops there; `standard` (the default) adds `source:` and `components:`; `detailed` adds `styles:`.
- **When done:** the report request (FR28) with the item count. The person reads the report, checks the work and marks notes done in the toolbar.

## The layout prompt

Layout mode's **Copy prompt** gives one prompt for the changes planned on a page, without storing notes (`formatLayoutPrompt`; golden `pricing.layout.prompt.md`):

```
# Layout changes: /pricing, 2 elements, 7 changes
Make every change below on /pricing (src/pages/Pricing.jsx), in the code, with the project's own styles and tokens.
They were planned in a 1920px wide window: keep the layout working at other widths.
Sizes "as rendered" (width, height and their min and max) are the size on screen, border and padding included.

Note: "Make the plans feel more spacious, and put Pro first"

## 1. div · PlanCard  (src/components/PlanCard.jsx:3:5)
selector: main > section > div:nth-of-type(2)
components: App > Pricing > PlanCard
- move it before `main > section > div:nth-of-type(1)` (div): 2nd of 2 → 1st
- max-width as rendered none → 480px
...

## When done
Report every element number (1 to 2) as done, skipped or blocked, and name the route to open to verify it.
```

A plan that inserts new parts (golden `insert.layout.prompt.md`) says once, after the header: reuse the named component when there is one; a saved capture is a reference to rebuild with the project's own components and tokens (luci-mcp `get_capture` reads it); a new block is a placeholder for what its label says. Each insert is a step under the element it goes before, after or inside: `insert a new heading inside it, at the start`.

## The new-page prompt

Layout mode's **New page** gives one prompt for a sketched page (`formatWireframePrompt`; golden `enterprise.page.prompt.md`): `# New page: /enterprise, 4 parts`, an instruction to create the route with the project's own components (sketched width, heights are rough), the note, then `## The page, top to bottom` with one numbered line per row (`1. Full width, about 56px tall: the \`Nav\` component (src/components/Nav.jsx; one is at \`nav\`)`; a row of several lists `2a.`, `2b.` with their share, such as `2/3 of the width: a new text: "Headline"`), and the report request for every part. As a Feedback note, the same lines follow `new page /enterprise, sketched in a 1280px wide window (...), top to bottom:`.

## Team Feedback reviews

A reviewer leaves notes on a live or staging site in the Chrome extension's **Team Feedback** tab and
copies one review to send to the designer (Slack, email). Schemas, the formatter and the parser are in
`packages/format/src/feedback/review.ts`. A review is plain text people can read, then one fenced
`luci-review` block of JSON lines for Luci:

````
Luci Review — Maya (PM)
Site: staging.example.com · Date: 2026-11-26 · 2 notes

1. [/pricing] The plan names are hard to tell apart
2. [/checkout] Error text is too light

```luci-review
{"v":1,"r":"Maya","role":"PM","site":"staging.example.com","at":"2026-11-26T09:12:00.000Z","vp":"1440x900","br":"Chrome 131"}
{"n":1,"p":"/pricing","el":"h2 (heading)","txt":"Pro","cmp":"PlanCard","sel":"main > section > div:nth-of-type(2) > h2","pos":[52,31],"m":{"c":"#1f2937","fs":"20px","fw":"600"}}
{"n":2,"p":"/checkout","el":"p (alert)","sel":"[role=alert]","pos":[50,24]}
```
````

- **First line of the block:** `v` format version, `r` the reviewer's name, `role`, `site`, `at`, and
  optionally `vp` (window size) and `br` (browser).
- **One line per note:** `n` its number, `p` the route, and the anchor Luci uses to find the element
  again: `el` (tag and role), `txt` (visible text), `cmp` (component), `sel` (selector), `pos` (the
  element's centre as a percentage of the page, `[x, y]`), and `m`, measured values (`c` colour, `bg`
  background, `ff` font family, `fs` size, `fw` weight, `pd` padding, `mg` margin, `gp` gap, `br` radius).
- **Damaged or missing block:** if Slack or email mangles the block, or someone deletes it, the review
  still imports as plain-text notes without anchors, with a warning. Nothing is guessed.
- **Untrusted text:** everything in a review is treated as untrusted. Notes and anchor fields are made
  single-line, and code fences and headings are neutralised before anything reaches an agent prompt.

The designer pastes reviews into the dev toolbar's **Builder** tab. It merges duplicate notes across
reviewers, places each on its element (asking when the match is not clear), checks it against the
project's design files, and adds the confirmed notes as feedback items with `reviewerRoles`. The
reviewer's name stays in the designer's browser: items, prompts and files carry the role only.

**Watch mode** (v0.2): the luci-mcp tool `watch_feedback` waits (default 120 seconds, at most 600) for notes added after `since` (default: when it is called) that are still new, and returns them as one prompt in this same format, followed by `Watching: after this, call watch_feedback again with since "<time>"`. With none, it says so and gives the same `since` to call again with. It reads only.

Copying a prompt marks its items `sent` (copied); the next copy holds the new notes, or every note not done when there are none new (FR29). Reading the prompt over MCP changes nothing.
