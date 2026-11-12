# Capture files (design.md)

Every capture is one Markdown file: YAML frontmatter that records where it came from, then fixed sections that depend on its scope and type. The schemas live in `packages/format/src/capture/` (import `@luci/format/capture`, which is browser-safe), and `formatCapture` is a pure function, so the same capture and settings always give the same text.

The golden files in `packages/format/fixtures/capture/` are the reference for this spec, and the format tests check the formatter against them. Their inputs are in `inputs.json`; `node scripts/capture-goldens.mjs` rewrites them after a build. Review any change by eye before committing it.

This page covers the scopes M4 writes: single tokens and page systems. Component, section and collection (the basket export) follow in M5.

## Frontmatter

| Field | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Lowercase slug, e.g. `text-heading-1` |
| `scope` | yes | `token` or `system` (later `component`, `section`, `page`, `collection`) |
| `type` | yes | For `token`: `text`, `color` or `spacing`. For `system`: `typography`, `color` or `spacing` |
| `source` | yes | The page: origin and path only. The query and fragment are dropped, because they can carry personal data |
| `selector` | tokens only | The picked element. System files have none |
| `captured` | yes | `YYYY-MM-DD` |
| `method` | yes | `measured` when read from the live DOM; `estimated` when guessed, such as a pixel picked from an image |
| `extends` | no | Another capture file this one builds on |

Values are plain YAML scalars when they read back unchanged, and JSON-quoted otherwise (selectors with `#`, quotes or `: `).

## Values

Every value records what the browser computed, plus what the site authored when it says more (`var(--space-4)`, `clamp(2rem, 5vw, 3rem)`, `1.15`), plus the custom property it resolves through. Tables show them in `Value`, `Authored` and `Token` columns.

Two settings change how values are written; the authored value is always kept beside them:

- **Units:** `px` (default), `rem`, or `both` (`16px (1rem)`). rem uses the page's root font size. Keywords such as `normal` are left as they are.
- **Colours:** `hex` (default; 8 digits with alpha), `rgb`, `hsl` or `oklch`. A fully transparent colour is written `transparent`.

## Structure only

Files describe structure, never content: no page text, no image URLs. Elements are named from their tag and role, such as `h1 (heading)` or `ul (list)`, never from class names, which are often hashed.

## File names

One file per capture, flat: `<site>.<scope>.<name>.design.md`, where `<site>` is the host without `www.` (`example-com`). System files use their type as the name: `example-com.system.typography.design.md`.

## Sections

| Scope and type | Sections |
| --- | --- |
| token, text | Text style (font-family, font-size, font-weight, line-height, letter-spacing, color, and font-style, text-transform or text-decoration when set); Where used |
| token, color | Colour (value, authored, token, role); Where used (element, property, selector), or a note that the pixel matched no element and is estimated |
| token, spacing | Spacing (value, kind: padding, margin, gap or distance; property; label: `authored` when a CSS declaration sets it, `measured` when it comes from geometry); Where used, or From and To for a distance |
| system, typography | Roles (role, family, size, weight, line height, letter spacing, colour, uses, elements); Families; Scale |
| system, color | Roles (background, text, border, accent; with uses and the properties that apply them); Tokens (colour custom properties, including unused ones) |
| system, spacing | Scale (values with uses and tokens); Base unit (the unit most uses are multiples of, and the share that fits); Outliers |

`parseCapture` checks a file's frontmatter and that every section its scope and type need is present.
