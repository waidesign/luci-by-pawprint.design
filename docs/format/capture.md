# Capture files (design.md)

Every capture is one Markdown file: YAML frontmatter that records where it came from, then fixed sections that depend on its scope and type. The schemas live in `packages/format/src/capture/` (import `@luci/format/capture`, which is browser-safe), and `formatCapture` is a pure function, so the same capture and settings always give the same text.

The golden files in `packages/format/fixtures/capture/` are the reference for this spec, and the format tests check the formatter against them. Their inputs are in `inputs.json`; `node scripts/capture-goldens.mjs` rewrites them after a build. Review any change by eye before committing it.

This page covers single tokens and page systems (M4), components and the basket export (M5), the full-page reference, and v0.2's sections, accessibility notes and basket item notes.

## Frontmatter

| Field | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Lowercase slug, e.g. `text-heading-1` |
| `scope` | yes | `token`, `system`, `component`, `section` (v0.2) or `page` (`collection` for the basket export) |
| `type` | yes | For `token`: `text`, `color` or `spacing`. For `system`: `typography`, `color` or `spacing`. For `component`: what it is. For `page`: `page` |
| `source` | yes | The page: origin and path only. The query and fragment are dropped, because they can carry personal data. With the **Source** setting `site`, only the site's name (`lattice.com`: the host without `www.`, with the port for a local server); a page without a host keeps its address |
| `selector` | tokens and components | The picked element. System and page files have none |
| `captured` | yes | `YYYY-MM-DD` |
| `method` | yes | `measured` when read from the live DOM; `estimated` when guessed, such as a pixel picked from an image or a palette from a screenshot (v0.4); `authored` when read from the project's own stylesheets (the design baseline, B14) |
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

Files describe structure, never content: no page text, no image URLs, no image files or pixels. Any `url(...)` in a value is written `<image>`. Elements are named from their tag and role, such as `h1 (heading)` or `ul (list)`, never from class names, which are often hashed.

## File names

One file per capture, flat: `<site>.<scope>.<name>.design.md`, where `<site>` is the host without `www.` (`example-com`). System files use their type as the name: `example-com.system.typography.design.md`.

## Sections

| Scope and type | Sections |
| --- | --- |
| token, text | Text style (font-family, font-size, font-weight, line-height, letter-spacing, color, and font-style, text-transform or text-decoration when set); Where used |
| token, color | Color (value, authored, token, role); Where used (element, property, selector), or a note that the pixel matched no element and is estimated |
| token, spacing | Spacing (value, kind: padding, margin, gap or distance; property; label: `authored` when a CSS declaration sets it, `measured` when it comes from geometry); Where used, or From and To for a distance. The Spacing tool's **All** (its default) writes every padding, margin and gap one element sets as rows of the same table, in one file named `spacing-<tag>` |
| system, typography | Roles (role, family, size, weight, line height, letter spacing, color, uses, elements); Families; Scale |
| system, color | Roles (background, text, border, accent; with uses and the properties that apply them); Tokens (color custom properties on `:root`, including unused ones; a property whose name has characters other than letters, digits, `-` and `_`, such as Webflow's deleted variables, is left out) |
| system, spacing | Scale (values with uses and tokens); Base unit (the unit most uses are multiples of, and the share that fits); Outliers |

`parseCapture` checks a file's frontmatter and that every section its scope and type need is present.

### Site-level systems (v0.3.3)

`mergeSystems` (`merge.ts`) merges one system type captured on two or more pages of one site into a site-level system: `name: site-<type>`, the site's root as `source`, and `pages: ["/pricing", "/blog"]` in the frontmatter; the file is `<site>.system.site-<type>.design.md`, so it never replaces a page's own system file. Rows are unified by what they are, not by how a page named them: text styles by their look (first font, size, weight, line height, letter spacing, color), color roles by role and `colorKey`, spacing values by px; uses are summed, a token or authored value is kept only when every page agrees, and families with the same first font are one row (written as the most used stack). The Roles tables (typography and color), color Tokens and the spacing Scale gain a **Pages** column: `all`, or the paths of the pages that use the row. A style that keeps the most uses takes a role name; another style with the same name is numbered (`heading-2-2`). The spacing base unit and outliers are found again over all pages. A **Conflicts** section lists, as `What | Values by page`, each text role (heading levels and named roles; page-local numbering such as `body-2` is ignored) and each token with different values on different pages, then a line asking to decide which one the site means; with none it says so. `mergeGroups` says which basket items can merge (single-page systems of one type and site, from two pages or more; a page captured twice counts once, the latest). Goldens: `fixtures/merge/` (the system goldens' /pricing inputs plus a /blog page with a heading-2, a `--color-primary` and a `--space-4` that differ).

### The project design baseline (B14)

`buildBaseline` (`baseline.ts`) reads a project's own stylesheets and writes its three systems as `project.system.typography.design.md`, `project.system.color.design.md` and `project.system.spacing.design.md` in `.luci/design/`, with `method: authored`, `name: project-<type>` and `source: file:///<project folder name>` (no other path). The stylesheets are the project's `.css`, `.scss`, `.less` and `.pcss` files and the `<style>` blocks of `.vue`, `.svelte` and `.astro` files, never `node_modules`, build output, minified files or hidden folders (at most 400 files of 1 MB each). Nested rules are flattened (a Sass `&` keeps its parent), `@media`, `@supports`, `@layer` and `@container` pass their rules through, `@keyframes` and `@font-face` are skipped, and Tailwind v4's `@theme` holds tokens like `:root`. Values resolve through custom properties (`var()`, with fallbacks) and Sass `$` or Less `@` variables; lengths are written in px at the stylesheets' root font size (`html { font-size: 62.5% }` makes `1rem` 10px), with the written value as Authored and its token.

- **Tokens**: each custom property's first definition on the root (`:root`, `html`, `:host`, `body`, `@theme`, a `[data-theme]` attribute or a `.light`, `.dark` or `.theme-*` class).
- **Colors**: each color a declaration uses, by the role its property gives it (`color` text; `background` background; `border`, `outline` border; `fill`, `stroke`, `accent-color` accent), at most six a role, most used first; fully transparent colors, `currentColor` and `inherit` are left out. Tokens: every color token, with how many declarations use it.
- **Spacing**: every length of `padding`, `margin`, `gap` and `inset` declarations, with the base unit and outliers as for a page.
- **Typography**: roles only from element rules, never classes: `body` (`html`, `body`, `:root`), `heading-1` to `heading-6`, `paragraph`, `small`, `code`, `button`, `label`, `link`. A role takes what its rule sets and the rest from `body` (or, for a heading's size and weight, the browser's defaults). Families and the size scale count every `font-family` and `font-size` declaration.
- **Uses** count the declarations that set a value. A token no declaration uses (a utility framework's theme: Tailwind classes use it in markup, not in CSS) counts its own definition once in the spacing and size scales, and a color token named for a role (`--color-background`, `--text`, `--border`, `--primary`) gets that role.

`luci init` writes the baseline for a project with stylesheets, and `luci capture baseline` rebuilds it (`--dry-run` shows what it would write); the person's `## Your instructions` in a baseline file survive a rebuild, and a system the stylesheets no longer have loses its file. Agents find the files with `list_captures`.

### Compare (v0.4)

`compareCaptures` (`compare.ts`) compares two captures of any scope value by value (component parts, styles, state changes, motion, accessibility; text styles; system roles and scales), and `compareComponentFiles` compares two component files as saved, with the design check's own rules (`checkComponent`). Values are compared by meaning, as the design check compares them. `formatCompareReport` writes the result: who A and B are, how many values are the same, and a `What | A | B` table of the differences. The basket compares two items, `luci capture compare <a> <b>` and the MCP tool `compare_captures` compare two saved component files.

### Remap to my tokens (v0.4)

`remapCapture` (`remap.ts`) rewrites a capture onto the person's own tokens in one step. Their tokens come from their project's stylesheets (the dev toolbar asks `luci serve`'s `GET /tokens`, read fresh each time) or from CSS they paste (`parseTokens`: every custom property, with or without a rule around it, resolved through the others; kept for next time). Each value one of their tokens holds is written through it (Authored `var(--brand)`, Token `--brand`); a shorthand maps word by word (`var(--gap-3) var(--gap-6)`). Colors match in any notation, and a name that suits the role wins (`--text-*` for `color`, `--bg-*` for backgrounds). Lengths match within half a pixel, but only onto tokens named for their kind: spacing (`space`, `spacing`, `gap`, `gutter`, `inset`, `size`) for padding, margin, gap and offsets, radius (`radius`, `rounded`, `corner`) for corners, text sizes for `font-size`, `leading` for line height, `tracking` for letter spacing. Fonts match by their first family, weights, shadows and durations by tokens named for them. A value none of their tokens holds keeps its value and loses the site's token and any `var()` in its Authored value, so the file never names tokens their project lacks. The Tokens list of a component or section becomes their tokens it uses (with the parts that use them), a color system's Tokens become their color tokens. `remapSummary` says what happened ("14 of 18 values now use your tokens. 4 have no token of yours: ..."). In the toolbar, **Use my tokens** on a capture does it, and **Put the site's values back** undoes it; a file edited by hand must be undone first.

## Components

`scope: component`, with `type` naming what it is (`button`, `link`, `card`...) and `selector` required. Sections:

| Section | Content |
| --- | --- |
| Tokens | Each custom property the component uses: its resolved value and the properties it sets |
| Anatomy | One line per part, the container first. Parts are named from tag, ARIA role and structure (`container`, `label`, `icon`...), never from class names. Each line lists the part's own styles, without browser defaults; tokens and authored values in brackets. An element without text that changes in a state (an arrow, a shadow layer, a highlight) is listed as a `decoration`; one hidden at rest says **appears on hover** (or the state it appears in) |
| Images | Only when the component shows images. One row per image slot, named as its part in Anatomy (`container` for the component's own background photo), so States and Motion read with it (a hover zoom on `image`). **Kind**: `img`, `video`, `canvas`, `SVG image` (a picture inside an SVG drawing) or `background image`. **Size**. **Shape**: the aspect ratio shown (`16:9`, or `2.4:1` when not a common one), the file's own when it is cropped (`file is 3:2`), and `set by aspect-ratio` when CSS fixes it. **Fit**: object-fit and position, background size, position and repeat, or an SVG image's `preserveAspectRatio`. **Corners**: the radius with its token, and when an element around it clips them, which (`top corners, clipped by the container`). **Effects**: shadow, filter, opacity, blend mode, mask, clip path. **Layers over it**: a background photo's own gradients, `::before`/`::after`, and positioned elements without text that cover it. The section ends with one line: these are slots for your own images; no image file or URL is included. A bare `img`, `video`, `canvas` or SVG `<image>` is not a component of its own: the toolbar points to the component around it |
| States | One row per state: `hover`, `focus`, `focus-visible`, `active`, `disabled`. Each change is `property before → after`, on the container or on a named part; movement is written as people write it (`translateY(-12px)`, `rotate(90deg) scale(0.5)`), and shadow layers nobody sees are dropped. States are read the way a real pointer sets them: hover and press on the component *and every element around it*, focus on the element that takes it (a link around a card). A state that comes from an element around the component (Tailwind's `group-hover`, `a:hover > div`) starts with **On the a (link) around it (`selector`, 1 level up):**. **Read from** says how: `browser, state forced` (the extension's debugger), `browser, pointer moved onto it` (a real pointer, so a hover done in JavaScript is seen), `stylesheet rules`, `disabled attribute` (set for a moment), or `captured by hand`. A state Luci checked in the browser that changes nothing says **No change**; one only looked for in the stylesheets says **Not in the stylesheets**, since it may change through JavaScript, and Luci's "Capture by hand" records it. Chrome's own focus ring is marked as the browser's default |
| Motion | Transitions (property, duration, easing, delay) and animations (name, duration, easing): the container's, then each part that changes in a state, as `part: transition ...` |
| Accessibility | Added in v0.2 (also in text files, after Where used). One table, measured on the page against WCAG 2.2: **Text contrast** for each part with its own text (the ratio, rounded down to two decimals; the text and background colors, the background being the element's and its ancestors' backgrounds layered over a white canvas; normal or large text; the level met, AA 4.5:1 and AAA 7:1, or 3:1 and 4.5:1 for large text), marked **Estimated** when the background has a picture or gradient or something on the way is see-through. For something you click or type in: **Target size** (AA 24 × 24px, AAA 44 × 44px; inline links in a sentence are exempt) and **Focus visible** (the properties its focus-visible, else focus, state changes; **No** when the browser forced focus and nothing visible changed; **Unknown** when only stylesheet rules were read). Ends with a line to check again wherever colors, sizes or focus styles differ |
| Variants | Only in the whole-system output: similar elements on the page, grouped, with how each group differs from the picked one and an example selector |

### Responsive (v0.3.4)

Component and section files can have a `## Responsive` section (after Motion in a component, after Components in a section, before Accessibility), when the person asked for it. Data: `responsive: { widths, queries, changes }`: 2 or 3 window widths in px, narrowest first; the media conditions that style it (`(min-width: 768px)`); and one change per part and property that differs, `{ part, property, values }` with one value per width (null where it is not set). The table is `Part | Property | <width>px ...`, values with the unit and color settings and `–` where not set; then the media queries (or a line saying none styles it and the widths are common ones) and a line on how it was read. Rules: grid-template-columns is written and compared as a count (`1 column`, `3 columns`), not track widths; a part found at some widths only gets a `shown` row (`no`, `yes`); a size (width, height, min-, max-) the site wrote the same way at every width is fluid and left out. In a section, repeated part names are numbered in order (`box (2)`). With no change: `- Nothing in it changes at 375px and 1280px.`

### Reading a component file back, and the design check (v0.3)

`readComponentFile` (`read.ts`) reads a component file back into values: Tokens, each Anatomy part with its styles (`{ property, value, token }`, the value as written, without the authored value or the rem form of the "both" setting), each state (`changes`, `no-change` for **No change**, `unknown` for **Not in the stylesheets** or **Not detected**; each change with its part, property, from and to), Motion, and each Accessibility row with its level. A comma inside a value (`Inter, sans-serif`, a list of shadows) is told from the comma between two properties by the CSS property name that follows. Other scopes fail with what to pick instead.

`checkComponent(design, built)` (`check.ts`) compares two read files, the design first. Both are written by the same formatter, so the toolbar writes the built one in px and hex and the design can use any setting. Values are compared by meaning: lengths in px within half a pixel (rem at a 16px root), colors by `colorKey` in any notation, times in ms, a bare `0` as `0px`, functions (`translateY(...)`, `cubic-bezier(...)`) argument by argument, font families by their first font. It compares each design part's styles (a property the built one lacks, a different value, or one the design does not set), parts one side lacks, each state's changes (skipped when the design's state is unknown; a built state Luci could not read says so), motion (`all` covers one property), and accessibility levels that got worse. A value that matches but is hard-coded where the design uses a token the built page also defines is a `token` difference. Each difference has a `kind`, `part`, `state`, `property`, `expected` (as the design writes it, with its token), `actual`, a `comment` written for the note (`Its background-color is #2563eb; the design says #0f62fe (--brand).`, `On hover, the label's color does not change; the design changes it to #ffffff.`) and a `priority`: high for accessibility, medium for a value that differs, low for something extra, a missing optional part or a token. `formatCheckReport` writes the result as a prompt to copy (golden `fixtures/check/primary-button.check.md`, from the built button `fixtures/check/localhost-5173.component.primary-button.design.md` against the primary-button golden).

### The automatic design check (v0.4)

After a check, the toolbar checks the built component again whenever the page changes (a hot reload of a stylesheet or component, any change to the page's DOM; Luci's own UI and its own reading of states never count), 0.7 s after it settles, finding the component again by its selector. The result says `Checked again at <time>: <n> differences (was <m>).` The dev toolbar does it from the start, and the watched check is kept for the tab (`sessionStorage`, `luci.autoCheck`), so a full reload picks it up again; the extension does it only when the person ticks **Check again when the page changes** (its states use the debugger, which would show Chrome's bar on every change). Each run, first and later ones, is a `CheckRun` (`checkRunSchema`: design file, label, selector, page, `checkedAt`, how many values match, every difference). The dev toolbar sends it to `luci serve` (`POST /checks`), which keeps the latest run of each check (design, selector, page) in `.luci/design/checks.json`, at most 20, newest first; the agent reads them with the MCP tool `get_design_checks` (`formatCheckRun`: each check, when, and each difference to fix), so it can change the code, let the page reload, and read whether the component now matches.

### Screenshot mode (v0.4)

For apps and images that cannot be inspected, the Colour tool's **Image** reads a screenshot (dropped on its card, pasted, or chosen) into a color system with `method: estimated`: `estimatePalette` (`image.ts`) counts the image's visible pixels in 5-bit buckets, merges colors closer than 28 (RGB) into one, leaves out colors under 0.4% of the picture, and keeps up to 8, largest first; `guessRoles` makes the largest the background, the near-neutral color that stands out most against it (3:1 or more) the text, the most saturated the accent, a faint line color (1.05 to 1.8:1) the border, and the rest surfaces, accents or text. `imageColorSystem` names it `image-<file name>` with `source: file:///<file name>` (no path), its file `image-<file name>.system.color.design.md`; Roles is a `Role | Value | Share` table (each color's share of the picture), and Tokens says that an image has no custom properties, every color is a guess from its pixels, and text styles and spacing cannot be read from an image.

### Capture to rule (v0.3.2)

`ruleFromComponent(spec, file)` (`rule.ts`) turns a read component file into a proposal (the format of `.luci/memory/proposed/`, `Belongs in: rules.md`) whose rule is one line: `Build every <name in words> like \`<file>\` (read it first: parts, states, motion, accessibility): <container values>; <first text part> <text values>; on <state> <changes>.` Container values are background-color, color, border, border-radius, padding, gap and box-shadow; text values font-family, font-size, font-weight, line-height, color and text-transform; each with its token in brackets, when the design sets them. Each state that changes gives at most two changes. A file with the person's instructions adds `Follow the person's instructions at the top of the file.` Goldens: `fixtures/rule/primary-button.proposal.md` and `card.proposal.md`.

## Sections (section)

Added in v0.2. The Component tool's **This section** turns a picked part of a page (a pricing section, a hero, a footer) into one section file plus one component file per kind of component in it (golden `example-com.section.pricing.design.md`). In the extension they download as one `.zip`; in the dev toolbar, **Save to project** writes them all into `.luci/design/`; **Add to basket** adds them all (the basket export has a `# Sections` group first).

`scope: section`, `type` the section's tag when it says what it is (`section`, `header`, `footer`, `main`, `aside`, `nav`, `form`, `article`), else `section`; `name` its id when the selector has one (`#pricing` gives `pricing`). Sections:

| Section | Content |
| --- | --- |
| Tokens | Custom properties the section's own boxes and text use (each component's are in its file) |
| Structure | An outline in page order, one line per node, indented by depth: `container` (the section's own layout: display, flex and grid settings, grid columns, wrapping, max width, padding, background...), layout boxes named by how they lay out (`grid`, `row`, `column`, `group`) with their own styles, text parts (`heading`, `description`, `label`...) with their text style and never their text, image slots (size and shape), and components: `card ×3 — div → component \`plan-card\` (file), variants in order: ...`. Boxes with no styles of their own are left out (their children move up). At most 8 levels and 80 lines. Ends with a note that each component is described once in its own file |
| Components | One row per component file: name, type, how many are in the section (and `inside \`plan-card\`` for a button or field placed in another component), how many variants, and the file |
| Accessibility | Contrast of the section's own text parts |

Components in a section are the outermost buttons, fields, cards, badges, navigation, forms, tables and dialogs in it (a box holding other cards is layout, not a card). One file per kind (same tag and type), captured from the first one, with its variants counted inside the section. A button or field inside another component gets its own file too, so its hover, focus and disabled states are described; the outer component's file lists it as a part.

## Full-page reference (page)

The toolbar's **Whole page** writes one file for the current page: `scope: page`, `type: page`, named from the page's path (`pricing`; `home` for `/`), so `example-com.page.pricing.design.md`. Sections:

| Section | Content |
| --- | --- |
| Typography | The typography system: Roles, Families, Scale, one heading level down (`### Roles`) |
| Colors | The color system: Roles, Tokens |
| Spacing | The spacing system: Scale, Base unit, Outliers |
| Components | One `### <name>` per kind of component on the page (button, link, field, navigation, header, footer, form, dialog, table, card, badge; at most 16): its type and an example selector, then its Tokens, Anatomy, Images (when it shows any), States, Motion and Variants two heading levels down (`#### States`). Bare images are never listed as components |

A system the page does not have (no visible text, colors or spacing) is a one-line note instead. A part Luci cannot read on a real site (a system, or one component) is left out rather than failing the file, and an optional last section, **Left out**, lists each such part with the reason. In a page file, states come from stylesheet rules (and the disabled attribute), and only the states found are listed; a state done in JavaScript needs the component captured on its own.

## Basket export (collection)

The basket holds picks from any pages and sites and exports them as one file, `<name>.collection.design.md`:

- **Frontmatter:** `name`, `scope: collection`, `captured`, `items` (the count) and `sources` (every page, query and fragment dropped).
- **Body:** one `# group` per kind, in this order: Sections, Components, Text, Colors, Spacing, Systems, Pages.
- **Items:** under its group, each item is a `## <name>` section (the name you gave it in the basket), followed by:
  - its source, selector, type, method and date;
  - the item's own sections, every heading one level down (`### Tokens`...). An item's note (v0.2: written in the basket, for any item from any site) is its `### Your instructions`, first in its section, so each note stays with the item it is about.
- **Order:** within a group, items from the same page stay together, in the order they were added.

`parseCollection` checks the frontmatter and that the item sections add up to `items`.
