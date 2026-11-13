# Capture files (design.md)

Every capture is one Markdown file: YAML frontmatter that records where it came from, then fixed sections that depend on its scope and type. The schemas live in `packages/format/src/capture/` (import `@luci/format/capture`, which is browser-safe), and `formatCapture` is a pure function, so the same capture and settings always give the same text.

The golden files in `packages/format/fixtures/capture/` are the reference for this spec, and the format tests check the formatter against them. Their inputs are in `inputs.json`; `node scripts/capture-goldens.mjs` rewrites them after a build. Review any change by eye before committing it.

This page covers single tokens and page systems (M4), components and the basket export (M5), and the full-page reference. Section scope follows in v0.2.

## Frontmatter

| Field | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Lowercase slug, e.g. `text-heading-1` |
| `scope` | yes | `token`, `system`, `component` or `page` (`collection` for the basket export; `section` later) |
| `type` | yes | For `token`: `text`, `color` or `spacing`. For `system`: `typography`, `color` or `spacing`. For `component`: what it is. For `page`: `page` |
| `source` | yes | The page: origin and path only. The query and fragment are dropped, because they can carry personal data. With the **Source** setting `site`, only the site's name (`lattice.com`: the host without `www.`, with the port for a local server); a page without a host keeps its address |
| `selector` | tokens and components | The picked element. System and page files have none |
| `captured` | yes | `YYYY-MM-DD` |
| `method` | yes | `measured` when read from the live DOM; `estimated` when guessed, such as a pixel picked from an image |
| `extends` | no | Another capture file this one builds on |

Values are plain YAML scalars when they read back unchanged, and JSON-quoted otherwise (selectors with `#`, quotes or `: `).

## Values

Every value records what the browser computed, plus what the site authored when it says more (`var(--space-4)`, `clamp(2rem, 5vw, 3rem)`, `1.15`), plus the custom property it resolves through. Tables show them in `Value`, `Authored` and `Token` columns.

Two settings change how values are written (a third, **Source**, is described under Frontmatter); the authored value is always kept beside them:

- **Units:** `px` (default), `rem`, or `both` (`16px (1rem)`). rem uses the page's root font size. Keywords such as `normal` are left as they are.
- **Colors:** `hex` (default; 8 digits with alpha), `rgb`, `hsl` or `oklch`. A fully transparent color is written `transparent`.

## Your instructions

Any capture can carry the user's own instructions for their coding agent, typed in the toolbar ("use this as our primary button, but with our brand blue"). They are written word for word as the first section, `## Your instructions`, right after the frontmatter; a line starting with `#` is escaped so it cannot become a heading. Luci never writes or changes this text, and no AI is involved: the agent that reads the file applies it.

The user can also edit a capture file by hand in the toolbar. An edited file is kept as edited (the unit and color settings no longer apply to it), and a basket item keeps its edited text; exports use it.

## Structure only

Files describe structure, never content: no page text, no image URLs. Elements are named from their tag and role, such as `h1 (heading)` or `ul (list)`, never from class names, which are often hashed.

## File names

One file per capture, flat: `<site>.<scope>.<name>.design.md`, where `<site>` is the host without `www.` (`example-com`). System files use their type as the name: `example-com.system.typography.design.md`.

## Sections

| Scope and type | Sections |
| --- | --- |
| token, text | Text style (font-family, font-size, font-weight, line-height, letter-spacing, color, and font-style, text-transform or text-decoration when set); Where used |
| token, color | Color (value, authored, token, role); Where used (element, property, selector), or a note that the pixel matched no element and is estimated |
| token, spacing | Spacing (value, kind: padding, margin, gap or distance; property; label: `authored` when a CSS declaration sets it, `measured` when it comes from geometry); Where used, or From and To for a distance. The Spacing tool's **All** (its default) writes every padding, margin and gap one element sets as rows of the same table, in one file named `spacing-<tag>` |
| system, typography | Roles (role, family, size, weight, line height, letter spacing, color, uses, elements); Families; Scale |
| system, color | Roles (background, text, border, accent; with uses and the properties that apply them); Tokens (color custom properties, including unused ones) |
| system, spacing | Scale (values with uses and tokens); Base unit (the unit most uses are multiples of, and the share that fits); Outliers |

`parseCapture` checks a file's frontmatter and that every section its scope and type need is present.

## Components

`scope: component`, with `type` naming what it is (`button`, `link`, `card`...) and `selector` required. Sections:

| Section | Content |
| --- | --- |
| Tokens | Each custom property the component uses: its resolved value and the properties it sets |
| Anatomy | One line per part, the container first. Parts are named from tag, ARIA role and structure (`container`, `label`, `icon`...), never from class names. Each line lists the part's own styles, without browser defaults; tokens and authored values in brackets |
| States | One row per state: `hover`, `focus`, `focus-visible`, `active`, `disabled`. Each change is `property before → after`. **Read from** says how: `browser, state forced` (the extension's debugger), `stylesheet rules`, `disabled attribute` (set for a moment), or `captured by hand`. A state that changes nothing readable says **Not detected**, because it may change through JavaScript; Luci's "Capture by hand" records it (every missing state in turn by default) |
| Motion | Transitions (property, duration, easing, delay) and animations (name, duration, easing) |
| Variants | Only in the whole-system output: similar elements on the page, grouped, with how each group differs from the picked one and an example selector |

## Full-page reference (page)

The toolbar's **Whole page** writes one file for the current page: `scope: page`, `type: page`, named from the page's path (`pricing`; `home` for `/`), so `example-com.page.pricing.design.md`. Sections:

| Section | Content |
| --- | --- |
| Typography | The typography system: Roles, Families, Scale, one heading level down (`### Roles`) |
| Colors | The color system: Roles, Tokens |
| Spacing | The spacing system: Scale, Base unit, Outliers |
| Components | One `### <name>` per kind of component on the page (button, link, field, navigation, header, footer, form, dialog, table, card, badge; at most 16): its type and an example selector, then its Tokens, Anatomy, States, Motion and Variants two heading levels down (`#### States`) |

A system the page does not have (no visible text, colors or spacing) is a one-line note instead. In a page file, states come from stylesheet rules (and the disabled attribute), and only the states found are listed; a state done in JavaScript needs the component captured on its own.

## Basket export (collection)

The basket holds picks from any pages and sites and exports them as one file, `<name>.collection.design.md`:

- **Frontmatter:** `name`, `scope: collection`, `captured`, `items` (the count) and `sources` (every page, query and fragment dropped).
- **Body:** one `# group` per kind, in this order: Components, Text, Colors, Spacing, Systems, Pages.
- **Items:** under its group, each item is a `## <name>` section (the name you gave it in the basket), followed by:
  - its source, selector, type, method and date;
  - the item's own sections, every heading one level down (`### Tokens`...).
- **Order:** within a group, items from the same page stay together, in the order they were added.

`parseCollection` checks the frontmatter and that the item sections add up to `items`.
