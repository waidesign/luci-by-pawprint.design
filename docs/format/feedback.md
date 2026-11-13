# Feedback format

Feedback is what a person pins on elements of their running app for an agent to apply (PRD FR23 to FR31). It has two forms: **items**, stored one JSON file each in `.luci/feedback/`, and the **prompt**, the Markdown text an agent receives. Schemas and the formatter are in `packages/format/src/feedback` (`@luci/format/feedback`, browser-safe). The golden files in `packages/format/fixtures/feedback/` are the reference for the prompt; their inputs are in `prompt-inputs.json`, and `node scripts/capture-goldens.mjs` rewrites them after a build. Review any change by eye before committing it.

## Items

One file per item, `.luci/feedback/<id>.json`. Two programs write them (`luci serve` for the toolbar, `luci-mcp` for the agent), so each item is its own file and every write replaces the file in one step.

| Field | Content |
| --- | --- |
| `id` | The file's name: letters, digits, `-` and `_`. Never shown to agents |
| `ref` | The stable ID agents report on, `P<page>-A<n>` (FR27). A page's number is the order its route was first annotated in the session; `n` is the order on that page. A route keeps its number while any item on it remains, and numbers on a page are never reused |
| `page` | `url`, `route` (the path, plus a `#/...` fragment for hash routers; never the query), `title`, and `source`: the page component's file when an adapter found it |
| `target` | `kind` (`element` or `text`), `selector`, `element` (tag and role, such as `h2 (heading)`), `text` (its visible text, shortened), `selectedText`, `components` (outermost first), `source` (`file`, `line`, `column`), `styles` (a few computed values), `rect` (where it was, to place the marker again) |
| `comment` | What the person wrote |
| `intent` | `fix`, `change`, `question` or `approve` |
| `priority` | `high`, `medium` or `low` |
| `status` | `pending`, `sent` (in a copied prompt, FR29), `acknowledged` (an agent is on it), `question` (the agent asked; see `thread`), `resolved` or `dismissed` (FR30) |
| `createdAt`, `updatedAt`, `sentAt` | ISO times in UTC |
| `thread` | Messages between the agent and the person: `from` (`agent` or `person`), `text`, `at` |
| `resolution` | What the agent did (resolved) or why not (dismissed) |

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
If Luci's MCP tools are connected, also call resolve_feedback ...
```

- **Header:** the number of pages and items. With more than one page, the agent is told not to stop after the first.
- **Pages:** `## Page i of N: <route>  (<page source>)`, in page-number order. When a prompt leaves out a page (all its items done), the IDs keep the session's page number and the heading says so: `(item IDs start with P3)`.
- **Items:** `- [ref] intent, priority: "comment"` (a multi-line comment is joined with ` / `), then `selector:`, `selected text:` for a text selection, `text:` (or `element:` when it has no text). Questions and answers so far follow as `you asked:` and `answer:`.
- **Detail level:** `compact` stops there; `standard` (the default) adds `source:` and `components:`; `detailed` adds `styles:`.
- **When done:** the report request (FR28) with the item count, and the MCP tools to use when connected.

Copying a prompt marks its items `sent`; the next copy leaves sent items out unless the person asks to include them (FR29).
