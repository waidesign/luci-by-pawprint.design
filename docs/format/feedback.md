# Feedback format

Feedback is what a person pins on elements of their running app for an agent to apply (PRD FR23 to FR31). It has two forms: **items**, stored one JSON file each in `.luci/feedback/`, and the **prompt**, the Markdown text an agent receives. Schemas and the formatter are in `packages/format/src/feedback` (`@luci/format/feedback`, browser-safe). The golden files in `packages/format/fixtures/feedback/` are the reference for the prompt; their inputs are in `prompt-inputs.json`, and `node scripts/capture-goldens.mjs` rewrites them after a build. Review any change by eye before committing it.

## Items

One file per item, `.luci/feedback/<id>.json`. `luci serve` writes them for the toolbar; `luci-mcp` only reads them (the agent never changes a note). Each item is its own file and every write replaces the file in one step.

| Field | Content |
| --- | --- |
| `id` | The file's name: letters, digits, `-` and `_`. Never shown to agents |
| `ref` | The stable ID agents report on, `P<page>-A<n>` (FR27). A page's number is the order its route was first annotated in the session; `n` is the order on that page. A route keeps its number while any item on it remains, and numbers on a page are never reused |
| `page` | `url`, `route` (the path, plus a `#/...` fragment for hash routers; never the query), `title`, and `source`: the page component's file when an adapter found it |
| `target` | `kind` (`element` or `text`), `selector`, `element` (tag and role, such as `h2 (heading)`), `text` (its visible text, shortened), `selectedText`, `components` (outermost first), `source` (`file`, `line`, `column`), `styles` (a few computed values), `rect` (where it was, to place the marker again) |
| `comment` | What the person wrote |
| `intent` | `fix`, `change`, `question` or `approve` |
| `priority` | `high`, `medium` or `low` |
| `status` | Set by the person: `pending` (new), `sent` (copied in a prompt, FR29) or `resolved` (marked done). `acknowledged`, `question` and `dismissed` are from the earlier agent sync (removed 13 Nov 2026) and are still read, as copied, copied and done |
| `createdAt`, `updatedAt`, `sentAt` | ISO times in UTC |
| `thread` | From the earlier agent sync, on older notes only: questions and answers (`from`, `text`, `at`) |
| `resolution` | From the earlier agent sync, on older notes only: what the agent said it did |
| `layout` | Optional, from Layout mode: `viewport` (the window's `width` and `height` it was planned at) and `changes`, each either `{ op: "move", position: "before" \| "after" \| "first" \| "last", sibling: { selector, element }, from, to, of }` (its place among its siblings, 1-based) or `{ op: "set", property, from, to, token }`. Properties: `width`, `height` (the size as rendered, border and padding included), `gap`, `row-gap`, `column-gap`, `padding`, `margin-top`, `margin-bottom`. `token` names the page's custom property with that value |

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
- **Layout notes:** after the element lines, `layout, planned in a 1280px wide window (keep it working at other widths):` and one step per change, such as `move it before \`nav > a:nth-of-type(1)\` (a): 3rd of 3 → 1st` or `padding 16px → 24px (--space-6)`.
- **Detail level:** `compact` stops there; `standard` (the default) adds `source:` and `components:`; `detailed` adds `styles:`.
- **When done:** the report request (FR28) with the item count. The person reads the report, checks the work and marks notes done in the toolbar.

Copying a prompt marks its items `sent` (copied); the next copy holds the new notes, or every note not done when there are none new (FR29). Reading the prompt over MCP changes nothing.
