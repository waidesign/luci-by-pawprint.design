# Luci: Product Requirements and Pre-Build Suggestions

Nov 12, 2026 · @Lucas

# Part 1: Product Requirements

## Summary

Luci is one local-first toolkit that gives AI coding agents the four things they lack: memory of the project, the right skills for the task, exact design context, and precise feedback. It is a design-focused tool for designers, front-end developers and designer-developers: its skill library covers UI/UX and design, plus a few coding skills that close the gap between design and code. It is a single product in a new repository, built from the prototype's tested code. Its name is Luci.

It has four modules. **Brain** keeps project and personal memory. **Skills** loads only the skills a task needs. **Capture** is an on-page toolbar that writes a design.md for exactly what you pick. **Feedback** lets you annotate a running page and hand the agent one prompt that it completes in full.

Everything runs on your machine, with no backend, account or API key.

## Problem

AI coding agents start each session without the project's history, load skills they do not need, guess at design, and misread feedback. Today each of these is patched by a separate tool, and the tools do not share anything.

- **Agents forget.** Rules, decisions and preferences have to be repeated in every session and for every agent.
- **Skills are all or nothing.** Loading a large skill library wastes context; loading none loses know-how.
- **Design extractors stop at the whole site.** There is no way to get one component, one section, one text style, one colour or one spacing value.
- **States are missing and screenshots are estimates.** Hover, focus and disabled styles are rarely captured, and reading an image only guesses values.
- **Feedback tools are tied to one framework and break across pages.** [Agentation](https://www.agentation.com/) installs in your own project and its richest output depends on React. It also repeats the same style of page header for each batch, so an agent given feedback from two pages confuses them.
- **Nothing connects.** Captured design, feedback and memory live in different places, so the agent never sees them together.

## Goals and non-goals

**Goals for v0.1**

1. One install and one command set up a project for every supported agent.
2. Agents start each session with project memory and personal preferences, without being told again.
3. Only skills that fit the task are loaded from a library focused on UI/UX, design and front-end work, each with a stated reason; nothing loads when nothing fits.
4. Pick a component, text, colour or spacing on a live page and get a scoped design.md in under 10 seconds, as one item or as the page-wide system.
5. Every captured value is measured from the live DOM, including hover, focus, active and disabled states.
6. Several picks collect in a basket and export as one file (or one .zip with their reference screenshots); images are captured only for how they are shown, never the image itself.
7. Feedback from several pages reaches the agent as one prompt and is applied in full (React first).
8. Captures and feedback are saved into the project's memory, so every agent sees them without copy and paste.
9. Everything runs locally: no backend, no account, no API key.

**Non-goals for v0.1**

- Whole-site crawling across many pages. "System" outputs cover the current page.
- Code export (HTML, React, Tailwind classes) or pixel-perfect cloning.
- Copying a site's text, images or brand assets.
- Figma export, and browsers other than Chrome.
- AI-written prose inside captured files.
- Cloud sync, team accounts or shared libraries.

## Users and use cases

The first user is you: a designer-developer who builds with AI coding agents every day and wants one tool for the whole loop, from setup to design reference to feedback.

| User | Need | Uses |
| --- | --- | --- |
| Designer-developer using AI agents (primary) | The whole loop in one tool | All four modules |
| Front-end developer | Agents that remember the project and load the right design and front-end skills | Brain and Skills, through the command line |
| Designer | Exact design reference from any live site | Capture, through the browser extension |
| React developer | Point at elements in a running app and send fixes to an agent | Feedback, through the dev toolbar |
| Open-source users (later) | A free, local tool with no account | Install from npm or GitHub |

**Core use cases**

1. **Set up a project.** One command detects the stack, creates the project's memory folder and configures each agent.
2. **Resume work.** In a new session the agent already knows the rules, decisions and active task.
3. **Load the right skills.** Describe a task and get only the matching skills, with the reason for each.
4. **Capture design.** Pick a component, text style, colour or spacing value, or collect several in the basket.
5. **Give feedback across pages.** Annotate elements on several pages and hand the agent one prompt it completes in full.
6. **Reference with notes.** On a site you do not own, capture a design.md and attach your own notes to it.

## Product modules

The product is four modules that share one storage place, the project's memory folder, which is what makes them one product and not four tools.

| Module | What it does | Where you use it | What it stores |
| --- | --- | --- | --- |
| Brain | Keeps personal preferences across projects, and each project's rules, decisions and active task | Command line; agents read it automatically | \~/.luci/ globally, and .luci/ inside each project |
| Skills | Holds a skill library and loads only what a task needs, with reasons | Command line; agents request skills on demand | Personal skills in your home directory; project skills in the project |
| Capture | On-page toolbar with four tools that write scoped design.md files | Browser extension on any site; dev toolbar in your project | `design/` in the project's memory folder, or a folder you choose |
| Feedback | Annotate elements, produce a page-grouped prompt, track each item's status | Dev toolbar in your project (React first); notes in the extension | `feedback/` in the project's memory folder |

**How they connect**

- A capture saved in the browser lands in the project's memory, so the agent can use it in the same session.
- Feedback items reach the agent through the same local server that serves memory and skills.
- One format package defines every file, so all four modules read and write the same shapes.

## Capture: tools, outputs and what can be picked

The toolbar has four capture tools, and every tool offers the same two outputs: this one item, or the whole system on the current page.

| Tool | How you pick | This one | The whole system (this page) |
| --- | --- | --- | --- |
| Component | Click an element; arrow keys widen or narrow | That component: tokens, anatomy, states, motion | All similar elements, grouped as variants |
| Text | Select text or click a text element | That text style: family, size, weight, line height, spacing, colour | Typography: every text style grouped into roles, with usage counts |
| Colour | Eyedropper on any pixel, or click an element | That colour: value, token name, where it is used | Colour system: all colours grouped by role |
| Spacing | Ruler: hover for padding, margin and gap; drag between two elements | That value, labelled as authored or measured | Spacing system: the scale, base unit and outliers |

"Whole system" means the current page. Captures from more pages can be merged through the basket.

**What can be picked**

The toolbar checks every element under the cursor before it can be selected.

| Result | Elements | Behaviour |
| --- | --- | --- |
| Allowed | Buttons, inputs, cards, navigation, sections, text, inline SVG, and components or SVG drawings used as product imagery | Normal highlight and capture |
| Image tool only | Images: `img`, `picture`, video, canvas, and photo backgrounds | Selectable with the Image tool, which records how the image is shown (size, shape, fit, corners, effects, overlays), never the image, its URL or its pixels. The other tools grey them out and point to the Image tool |
| Blocked | Embedded pages and content: `iframe`, `embed`, `object` | Greyed highlight with the reason; cannot be selected |
| Redirected | The whole page body | Suggests the page-wide system outputs instead |

**Scopes**

Section and page scopes share the same file format. A section file (v0.2) lists its components by reference, so each component is described once. A page file from any existing extractor can be used as the base that component files extend.

## Functional requirements (v0.1)

Version 0.1 covers all four modules: 56 requirements, 49 of them must-have (P0). IDs starting with B cover setup and memory, S covers skills, and FR covers capture and feedback.

**Setup and agents (command line)**

| ID | Requirement | Priority |
| --- | --- | --- |
| B1 | **Init.** One command detects the stack, creates the project's memory folder, runs a short onboarding and writes each agent's instruction file. | P0 |
| B2 | **Supported agents.** Claude Code and Cursor first; then Codex, Gemini CLI, GitHub Copilot and a generic instructions file. | P0 for the first two, P1 for the rest |
| B3 | **Start.** Resume a project: show the active task and the context an agent needs to continue. | P0 |
| B4 | **Update.** Refresh agent files and the skill catalogue after changes. | P0 |
| B5 | **Doctor.** Check the install and the project setup, and say how to fix what is wrong. | P0 |
| B6 | **Code map.** A built-in map of the code, powered by Graphify, that agents query instead of reading whole files. It switches on when Python is present. | P1 |

**Memory (Brain)**

| ID | Requirement | Priority |
| --- | --- | --- |
| B7 | **Global memory.** Personal preferences shared across all projects, in `~/.luci/`, which can be relocated. | P0 |
| B8 | **Project memory.** Rules, decisions and context in `.luci/`, committed with the project, plus a git-ignored area for private notes. | P0 |
| B9 | **Active task.** A per-project file with the current task and progress, kept up to date by the tool. | P0 |
| B10 | **PRD intake.** Take a PRD and supporting docs and fit them into the project's memory in the right places. | P0 |
| B11 | **Local server.** One MCP server gives agents project context, skills, design captures and pending feedback. | P0 |
| B12 | **Conflict detection.** Flag rules that contradict each other, across global and project memory. | P1 |
| B13 | **Import.** A one-time command converts a project set up with the earlier prototype into Luci's layout and rewrites its agent files. | P1 |

**Skills**

| ID | Requirement | Priority |
| --- | --- | --- |
| S1 | **Skill standard.** A skill file format that extends the common Agent Skills `SKILL.md` format. | P0 |
| S2 | **Selection.** Given a task, load the closely matching skills, explain each pick, and load nothing when nothing fits. | P0 |
| S3 | **Token budget.** Selection stays within a set context budget. | P0 |
| S4 | **Search and recommend.** Find skills by keyword, and suggest skills for the detected stack. | P0 |
| S5 | **Manage.** List, add, select and lint personal and project skills. | P0 |
| S6 | **Official library.** A design-focused library: UI/UX, design systems, accessibility, motion, components and front-end UI, plus a few coding skills that bridge design and code (tests, code review, React practices). Ship only skills whose licence allows redistribution, verified at the source. | P0 |
| S7 | **Evaluation.** A benchmark for selection quality that runs with the test suite. Tasks outside the design focus expect no skill. | P0 |

**Added after reading the prototype's source**

| ID | Requirement | Priority |
| --- | --- | --- |
| B14 | **Project design baseline.** For UI projects, build a design.md from values already in the project's stylesheets, in Luci's format, so agents reuse them. | P0 |
| B15 | **Memory updates.** Agents can propose additions to project memory; proposals wait in a review folder until a person accepts them. | P0 |
| S8 | **Skill packs.** Small curated sets of skills for one kind of work, offered at init when they fit the project, and removable without touching hand-picked skills. | P0 |
| S9 | **Skill import and trust levels.** Import skills from a GitHub repository; every skill shows where it came from and who has checked it. | P0 |
| S10 | **Ranking quality levels.** Each skill gets a level from incomplete to precise, and AI-drafted ranking fields are ignored until a person approves them. | P0 |

**Toolbar and picking (both shells)**

| ID | Requirement | Priority |
| --- | --- | --- |
| FR1 | **On-page toolbar.** A floating toolbar with tool modes: Component, Text, Colour, Spacing, Image. Rendered in a Shadow DOM so it never clashes with the page. | P0 |
| FR2 | **Element picker.** Hover highlights the element with its tag and size; click selects; Esc cancels. | P0 |
| FR3 | **Tree navigation.** Arrow keys widen to the parent or narrow to a child before confirming. | P0 |
| FR4 | **Eligibility check.** Images are selectable only with the Image tool, for their design treatment; the other tools grey them out with a reason; inline SVG and components are allowed; the page body redirects to system outputs. (Changed 13 Nov 2026: images were fully blocked.) | P0 |
| FR5 | **Two outputs per pick.** After any pick, choose "This one" or "The whole system". | P0 |
| FR6 | **Shadow DOM picking.** The picker can select inside web components. | P1 |

**Capture tools (both shells)**

| ID | Requirement | Priority |
| --- | --- | --- |
| FR7 | **Component extraction.** Computed styles for the selection and its children, with browser defaults removed. The system output groups similar elements on the page as variants. | P0 |
| FR8 | **State capture.** Hover, focus, focus-visible, active and disabled styles. | P0 |
| FR9 | **Token resolution.** Each CSS custom property is recorded with its name and resolved value. | P0 |
| FR10 | **Anatomy.** The parts of a component with roles taken from tag, ARIA and structure. | P0 |
| FR11 | **Text tool, single.** The selected text's family, size, weight, line height, letter spacing and colour. | P0 |
| FR12 | **Typography system.** All text styles on the page grouped into roles with usage counts. | P0 |
| FR13 | **Colour tool, single.** Eyedropper for any pixel, plus click-an-element. A pixel that matches an element colour resolves to its token; otherwise it is marked as estimated. | P0 |
| FR14 | **Colour system.** All colours on the page grouped by role: background, text, border, accent. | P0 |
| FR15 | **Spacing ruler, single.** Padding, margin and gap overlays on hover; drag to measure between two elements; each value labelled authored or measured. | P0 |
| FR16 | **Spacing system.** All spacing values on the page, the scale, the base unit and outliers. | P0 |
| FR17 | **Pseudo-elements and motion.** `::before`, `::after`, transitions and animations. | P1 |
| FR17a | **Image tool.** For an image, video, canvas, illustration or photo background: kind, rendered size, aspect ratio (and the file's own when cropped), fit and position, corners (including a clipping wrapper), shadow, filters, mask and the layers over it. No URL and no pixels; the agent is told to use its own image with the same treatment. (Added 13 Nov 2026.) | P1 |

**Basket and output (both shells)**

| ID | Requirement | Priority |
| --- | --- | --- |
| FR18 | **Capture basket.** Picks are added to a basket that persists across pages; items can be removed or renamed. | P0 |
| FR19 | **Export.** Export one item, or the whole basket as a single design.md grouped by type and source page, or as one .zip with that file and each item's reference screenshot. | P0 |
| FR20 | **Preview, copy, download.** Preview the markdown in the toolbar panel; copy or download as `.design.md`. | P0 |
| FR21 | **Structure only.** No page text or image URLs in the output by default. | P0 |
| FR22 | **Evidence screenshot.** A cropped image of the selection saved beside the file, named in its `reference` field and labelled reference only (values never come from it). Built 13 Nov 2026. | P1 |

**Feedback for agents (dev toolbar)**

| ID | Requirement | Priority |
| --- | --- | --- |
| FR23 | **Annotate.** Click an element or select text, write feedback, set intent and priority. | P0 |
| FR24 | **Prompt output.** Copy structured markdown with CSS selector, source file path, component tree and computed styles, at a selectable level of detail. | P0 |
| FR25 | **Any framework.** Selector and text snippet always; source file path and component tree through adapters, React first, then Vue and Svelte. | P0 for React, P1 for others |
| FR26 | **One session across pages.** Annotations are stored per project, not per page, and survive navigation and reloads. | P0 |
| FR27 | **Page-grouped prompt.** The prompt opens with the count of pages and items, groups items by page with route and source file, and gives each item a stable ID such as `P2-A3`. | P0 |
| FR28 | **Completion report.** The prompt ends by asking the agent to report the status of every item ID, page by page, and name the route to open to verify it. | P0 |
| FR29 | **Sent state.** Copied items are marked as sent, so the next copy does not repeat them unless asked. | P0 |
| FR30 | **Agent sync over MCP.** The agent can list pending items, acknowledge, ask a question, resolve with a summary and clear; each marker shows its status on the page. | P0 |
| FR31 | **Pause animations and webhook send.** Freeze the page to annotate a frame; send annotations to a configured webhook. | P1 |

FR26 to FR29 are the fix for the multi-page problem. The cause was confirmed in daily use: Agentation gives every batch the same style of page header, so an agent cannot tell two pages' feedback apart. One top header, numbered pages and a unique ID per item remove that confusion.

## Output format

Every capture is one markdown file with YAML frontmatter that records where it came from, followed by fixed sections that depend on the scope.

Example component file, with illustrative values:

```
---
name: primary-button
scope: component
type: button
source: https://example.com/pricing
selector: main section:nth-of-type(2) a.cta
captured: 2026-11-12
method: measured
extends: example-com.page.design.md
---

## Tokens
| Token | Value | Used for |
| --- | --- | --- |
| --color-primary | #0F62FE | background |
| --radius-md | 8px | corner radius |

## Anatomy
- container: inline-flex, gap 8px, padding 12px 20px
- label: 16px / 24px, weight 600
- icon (optional): 16px, trailing

## States
| State | Changes |
| --- | --- |
| hover | background #0353E9 |
| focus-visible | outline 2px #0F62FE, offset 2px |
| active | background #002D9C |
| disabled | opacity 0.5, cursor not-allowed |

## Motion
- background-color 150ms ease-out
```

| Scope | Frontmatter | Body sections |
| --- | --- | --- |
| Component | name, scope, type, source, selector, captured, method, extends | Tokens, Anatomy, States, Motion, Variants (v0.3) |
| Section | Same, plus `components` (list of file references) | Layout, Spacing, Responsive, Components |
| Page | name, scope, source, captured | The existing whole-site format, unchanged |

The `method` field is `measured` for DOM captures and `estimated` for the later screenshot mode, so a reader always knows how far to trust the values.

**Token, basket and feedback outputs**

| Output | `scope` value | Body sections |
| --- | --- | --- |
| Single text, colour or spacing | `token` | One entry: value, token name, where used, method |
| Typography system | `system`, type `typography` | Roles table, families, scale, usage counts |
| Colour system | `system`, type `color` | Roles table, tokens, usage counts |
| Spacing system | `system`, type `spacing` | Scale, base unit, outliers |
| Basket export | `collection` | One section per item, grouped by type, each with its own source page |
| Feedback prompt | Not a design.md | Pages and item count, items grouped by page, completion report request |

Example feedback prompt skeleton, with illustrative values:

```
# UI feedback: 2 pages, 3 items
Apply every item below. Do not stop after the first page.

## Page 1: /pricing  (src/pages/pricing.tsx)
- [P1-A1] fix, high: "Button label wraps on mobile"
  selector: main .plan-card:nth-of-type(2) button
- [P1-A2] change, medium: "Use the secondary button style"
  selector: footer .cta

## Page 2: /checkout  (src/pages/checkout.tsx)
- [P2-A1] fix, high: "Error text is too low contrast"
  selector: form .field-error

## When done
Report each item ID as done, skipped or blocked, grouped by page,
and name the route to open to verify it.
```

**Format and settings decisions**

- **Own format.** The capture and annotation formats are our own published spec. A one-click export produces Google's DESIGN.md format for tools that expect it.
- **Units.** A setting chooses `px`, `rem` or both.
- **Colours.** A setting chooses hex, `oklch`, `hsl` or `rgb`. The value as the site authored it is always kept alongside.
- **Storage.** Inside a project, captures go to `design/` and annotations to `feedback/` in the project's memory folder. Outside a project, the extension saves to a folder you choose once.

## Technical approach

The product is one new TypeScript repository with three surfaces over shared packages, and no server: everything runs on your machine and is stored as plain files.

```
Command line      Browser extension      Dev toolbar
(setup, memory,   (capture on any site,  (capture + feedback in
 skills)           debugger for states)   your own React project)
      \                  |                   /
       Shared packages: brain, skills, capture, feedback, format
                           |
              Project memory folder: .luci/
   (rules, active task, skills, design captures, feedback items)
                           |
   AI coding agents: Claude Code, Cursor, Codex, Gemini CLI, Copilot
     (read memory via instruction files + one local MCP server)
```

Every surface writes to the same project memory folder, and agents read only from there. The stack below was approved on 12 Nov 2026.

- **Ported foundation.** The prototype's memory and skills code is moved in module by module and converted to TypeScript, together with its tests. Capture and Feedback are written new.
- **Repository:** a pnpm monorepo with packages `brain`, `skills`, `capture`, `feedback`, `format`, `cli`, `mcp`, `extension` and `toolbar`.
- **Command line:** Node 18 or later, published to npm as one command.
- **Local server:** one MCP server on the official TypeScript SDK, serving project context, skills, captures and pending feedback.
- **Toolbar interface:** Preact inside a Shadow DOM, so it never clashes with the page and works on any site.
- **Extension:** Manifest V3, built with WXT. Permissions: `activeTab`, `scripting`, `debugger`, `storage`.
- **Component states:** Chrome DevTools Protocol `CSS.forcePseudoState` and `CSS.getMatchedStylesForNode` in the extension. The dev toolbar reads same-origin stylesheets.
- **Token tools:** plain `getComputedStyle`, identical in both toolbar shells. The eyedropper uses the browser's `EyeDropper` API.
- **Formats:** Zod schemas in the `format` package define every file; the formatter is a pure function. Colour conversion uses culori.
- **Storage:** plain files in the home directory and the project. No database and no cloud.
- **Tests:** Vitest for packages, Playwright for the toolbar on real sites, and the skill-selection benchmark.

Two parts sit outside the TypeScript stack or outside the product:

- **Code map:** Graphify is built in as the code map. It needs Python 3.10 or later, so Luci switches it on when Python is present and runs without it otherwise.
- **Build tooling:** Luci is built with the earlier prototype as the working tool for memory and skills. Once milestones M1 to M3 work, the project moves onto Luci itself.

## Release plan

Version 0.1 is built in six milestones, each usable on its own. The shared foundation comes first because every later module stores its files through it.

| Step | Adds | Done when |
| --- | --- | --- |
| v0.1 M1 | Foundation: repository, format schemas, command line with init and doctor, global and project memory, agent files for Claude Code and Cursor | Init runs on a fresh project and an agent reads the memory |
| v0.1 M2 | Skills: standard, selection with reasons, token budget, search, manage, packs, import with trust levels, benchmark | The selection benchmark meets its target |
| v0.1 M3 | Local server, active task, PRD intake, start and update, built-in code map, import from the prototype | An agent resumes a task in a new session without being re-briefed; Luci's own project moves onto Luci |
| v0.1 M4 | Capture in the extension: toolbar, picker, eligibility check, Text, Colour and Spacing tools | Each tool yields a correct file on every test site |
| v0.1 M5 | Component tool with states, tokens and variants; basket and export | Items from two sites export as one file |
| v0.1 M6 | Dev toolbar: feedback for React, page-grouped prompt, agent sync; captures saved into project memory | Feedback from three pages is applied in one agent run with a full report |
| v0.2 | Section scope, accessibility notes, notes on captures from any site, remaining agents | A picked pricing section yields one section file plus its component files |
| v0.3 | Design check (manual), capture to rule, responsive capture, multi-page system merge, conflict detection, source paths beyond React | A built button is checked against its design.md and each difference becomes a feedback item |
| v0.4 | Remap to your own tokens, compare mode, screenshot mode marked as estimated, automatic design check | A capture is rewritten onto your own tokens in one step |

## Success measures

Version 0.1 is done when it passes these fifteen checks: ten for capture and feedback, five for memory and skills. The targets are proposed starting points to adjust after the first test run.

| Measure | Target |
| --- | --- |
| Time from pick to file | Under 10 seconds |
| Accuracy | On 10 test components, at least 95% of values match the Computed panel in DevTools |
| State coverage | Hover, focus, active and disabled captured on 8 of 10 test buttons |
| Typography system | Every distinct text style on a test page appears once, with no duplicates |
| Colour system | Every colour used by a visible element appears, each with a role |
| Spacing system | The detected base unit matches the site's real one on 4 of 5 test sites |
| Images | Only the Image tool selects an `img`, video or canvas; inline SVG can be picked by every tool; no image file, URL or pixel data is in any capture file |
| Site coverage | Works on five sites, one per styling approach: utility classes, CSS-in-JS, CSS Modules, web components, plain CSS variables |
| Multi-page feedback | Items from three pages, pasted as one prompt, are all applied and all reported, in 10 of 10 runs |
| Agent rebuild test | A coding agent given only the file rebuilds the component, and it matches the original in default and hover states |

| Memory and skills measure | Target |
| --- | --- |
| Setup time | From init to a working agent session in under 5 minutes |
| Resume | In a new session the agent states the active task and project rules unprompted, in 10 of 10 runs |
| Skill selection | On the benchmark, the right skill is among those loaded for at least 90% of tasks, and nothing loads for unrelated tasks |
| Context cost | Loaded skills stay within the token budget in every benchmark run |
| Integration | A capture saved in the browser is usable by the agent in the same session, with no copy and paste |

## Risks and open questions

The biggest risk is size: four modules and three surfaces, built by one person on a prototype that covers only memory and skills.

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Scope for one person | A long wait before anything is usable | Six milestones, each usable alone |
| Porting the prototype's code | Regressions while converting to TypeScript and renaming | Port each module together with its tests; the benchmark must not fall below the prototype's recorded baseline |
| Skill ranking and memory retrieval are hard problems | Selection quality may disappoint | Keep the benchmark from day one; start with simple, explainable ranking; bring in systems expertise for this part |
| Skill licences | Some skills have no licence at their source | Ship only skills with a licence that allows redistribution until permission is given |
| Matching every Agentation feature | Its feature set keeps moving | Freeze a parity checklist before M6; treat later additions as new requests |
| Own file format | Other tools cannot read our files directly | One-click export to Google's DESIGN.md format |
| States driven by JavaScript, not CSS | Hover or active styles are missed | Flag the state as "not detected"; offer a manual "capture current state" button |
| Debugger banner | Chrome shows a "debugging this browser" bar while attached | Attach only during a component capture, detach straight after |
| Chrome Web Store review of the `debugger` permission | Publishing may be slow or refused | Ship as load-unpacked from GitHub first; submit to the store after the whole product is built |
| Hashed class names | Class names carry no meaning | Name parts from tag, ARIA role and structure, never from classes |
| Eyedropper on images | A picked pixel has no token or role | Mark the value as estimated in the file |

**Open questions**

No open questions remain as of 12 Nov 2026. The last three were settled as follows: Luci is the final name; the extension goes to the Chrome Web Store after the whole product is built; and the Agentation parity checklist is frozen in Part 3. Availability of the name on npm, as a domain and as a trademark has not been checked.

# Part 2: Suggestions Before Building

## Decisions made on 12 Nov 2026

Twenty-three decisions are settled and built into the PRD.

| Topic | Decision |
| --- | --- |
| Product | One product: memory, skills, design capture and feedback together |
| Name | Luci (final) |
| Codebase | A new repository; memory and skills are ported from the prototype with their tests, Capture and Feedback are new |
| Tech stack | Approved: TypeScript monorepo, Preact toolbar, WXT extension, MCP TypeScript SDK, Zod, Vitest and Playwright |
| Build tooling | Build Luci with the prototype; move onto Luci once M1 to M3 work |
| Capture delivery | An on-page toolbar: thin browser extension for any site, dev toolbar for your own projects |
| First release | Everything: all four modules in v0.1 |
| Capture basket | Yes |
| Images | Selectable with the Image tool for their design treatment, plus a reference screenshot of any pick; the original image files are not copied (changed 13 Nov 2026; was: fully blocked) |
| Feedback | Our own module replaces Agentation, with feature parity plus the multi-page fix; React first |
| Feedback on other sites | Yes: notes attached to captures from sites you do not own |
| Code map | Graphify stays as a built-in tool |
| Design presets | Dropped; Capture replaces them |
| Design check | In scope: manual check in v0.3, automatic in v0.4 |
| Migration | A one-time import command for projects set up with the prototype |
| Folder names | `.luci/` in each project and `~/.luci/` globally |
| File format | Our own spec, with export to Google's DESIGN.md format |
| Annotation format | Our own, designed to be clearer than Agentation's |
| Units | A setting: `px`, `rem` or both |
| Colour format | A setting: hex, `oklch`, `hsl` or `rgb` |
| Storage | Local folders only; captures and feedback live in the project's memory folder |
| Licence | MIT |
| Focus | Design: the skill library covers UI/UX and design plus a coding bridge, for designers and front-end developers (added 12 Nov 2026, before M2) |

## Decisions still to settle before writing code

Eight build choices remain, and each is cheaper to make now than to change later. My recommendation comes first in each.

1. **Port tested code, do not rewrite it.** Move the prototype's modules into the new repository one at a time, convert each to TypeScript, and keep its tests passing at every step.
2. **Build the shared foundation first.** Format schemas, the memory folder and the local server come before any toolbar work, because every module stores files through them.
3. **Write the format spec before the extractors.** Hand-write the target files (a button, a typography system, a basket export, a feedback prompt, a project memory layout) and build until the tool produces them.
4. **Use the debugger protocol in the extension.** It is the only reliable way to read hover and focus styles on sites you do not own.
5. **No AI inside the product in v0.1.** Deterministic capture and explainable skill ranking are faster, free and repeatable.
6. **Record both authored and computed values.** Keep `var(--space-4)` or `clamp(...)` alongside the computed `16px`.
7. **One file per capture, flat naming.** For example `example-com.component.primary-button.design.md`.
8. **Open-source from the first commit.** MIT from the start, with secrets kept out, avoids a history clean-up later.

## Feature ideas beyond the MVP

These ideas sit outside v0.1 and are ranked by how much each widens the gap from existing tools. The first two use the fact that capture and memory now live in one product.

| Rank | Idea | Why it matters | Version |
| --- | --- | --- | --- |
| 1 | **Design check.** Point the capture tools at a page the agent built, compare it with the design.md it was given, and raise the differences as feedback items. | Makes agent-built interface verifiable; no other tool closes this loop | v0.3 manual, v0.4 automatic |
| 2 | **Capture to rule.** Turn a captured component into a project rule or skill, such as "build every button like this". | Design reference becomes lasting memory, not a one-off file | v0.3 |
| 3 | **Section scope with component references.** | Fills the second half of the original capture gap | v0.2 |
| 4 | **Accessibility notes.** Contrast ratio, target size and focus visibility, computed from the capture. | Cheap to add, and agents rarely get this right unaided | v0.2 |
| 5 | **Responsive capture.** Values at two or three breakpoints, plus the queries that apply. | Sections change most across screen sizes | v0.3 |
| 6 | **Multi-page system merge.** Combine system captures from several pages into one site-level file. | Gets closer to a true site-wide system without crawling | v0.3 |
| 7 | **Remap to my tokens.** Rewrite a capture onto your own design tokens. | Borrow structure and behaviour without borrowing the brand | v0.4 |
| 8 | **Compare mode.** Diff two captures, such as two sites' buttons. | Useful for research and design reviews | v0.4 |
| 9 | **Screenshot mode.** Estimate a file from an image, with every value flagged as estimated. | A fallback for apps and images you cannot inspect | v0.4 |

## Recommended first step

Start with one inventory and two small spikes before any product code, because they test the three riskiest assumptions: that the rebuild loses nothing, that states can be captured, and that the multi-page prompt works.

1. **Behaviour inventory.** List everything the prototype does today, mark each item keep, change or drop, and write the keeps as tests.
2. **State spike.** A bare extension that attaches the debugger, forces hover and focus on a hard-coded selector, and logs the style differences. Run it on five buttons, one per styling approach, including one site you built yourself.
3. **Prompt spike.** Hand-write a three-page feedback prompt in the new format and paste it into your agent ten times. If every item is applied and reported each time, the format is right before any code exists.
4. **Format spec.** Hand-write the target files and the project memory layout, and agree the schemas.
5. **M1 to M3.** Foundation, skills, then the local server.
6. **M4 to M6.** Capture in the extension, the component tool and basket, then the dev toolbar with feedback.

If the state spike shows that most test buttons change state through JavaScript, the manual "capture current state" button becomes a v0.1 requirement. If the prompt spike fails, agent sync through the local server becomes the main fix and the pasted prompt the fallback.

Throughout M1 to M3 the project runs on the earlier prototype. Each problem met while using it is added to the behaviour inventory as a test for Luci.

# Part 3: Pre-build tests

## Feedback parity checklist (frozen 12 Nov 2026)

Luci's Feedback module matches these fourteen Agentation features, taken from [its public pages](https://www.agentation.com/). Anything Agentation adds after this date is a new request, not part of v0.1.

| Agentation feature | In Luci |
| --- | --- |
| Click an element to annotate it with a note | M6 |
| Select text to annotate a typo or content fix | M6 |
| Hover shows the element's name | M6 |
| Intent and priority on each annotation | M6 |
| Copy structured markdown for the agent | M6 |
| Selectable output detail level | M6 |
| Output includes CSS selector, source file path, React component tree and computed styles | M6 |
| Settings for marker colour and output detail | M6 |
| Clear all annotations | M6 |
| Agent reads pending annotations over MCP | M6 |
| Agent acknowledges, asks a question, resolves with a summary, or dismisses | M6 |
| Pause animations to annotate one frame | M6, lower priority |
| Send annotations to a webhook | M6, lower priority |
| Watch mode, where the agent waits for new annotations | v0.2 |

Luci adds five things Agentation lacks: one session across pages, a page-grouped prompt, a unique ID per item, a required completion report, and a sent state.

## Test 1: behaviour inventory

This table lists what the prototype does today, with my proposed decision for each. It is built from the prototype's README and its source at commit 5276a50 (9 Nov 2026), so change any decision you disagree with.

| Behaviour today | Proposed decision | Luci requirement |
| --- | --- | --- |
| Init detects the stack, creates the memory folder, runs onboarding, writes agent files | Keep | B1 |
| Agent files for Claude Code and Cursor | Keep | B2 |
| Agent files for Codex, Gemini CLI, Copilot and a generic file | Keep, in v0.2 | B2 |
| Start resumes a project | Keep | B3 |
| Update refreshes agent files, the skill catalogue and the code map | Keep | B4 |
| Doctor checks the install and project health | Keep | B5 |
| Commands that show memory, the code map and project context | Keep; fold into B5 | B5 |
| Global memory in the home directory, relocatable | Keep, under `~/.luci/` | B7 |
| Project memory committed with the project, plus a git-ignored local area | Keep, under `.luci/` | B8 |
| Active task file kept per project | Keep | B9 |
| Skill selection that explains each pick and loads nothing when nothing fits | Keep | S2 |
| Use, recommend and search commands | Keep | S2, S4 |
| List, select, add and lint skills | Keep | S5 |
| Skill standard that extends `SKILL.md` | Keep | S1 |
| Official skill library | Change: design-focused, and ship only skills with a licence that allows redistribution | S6 |
| Code map through Graphify | Keep, built in | B6 |
| Local MCP server for project context and skills | Change: also serves captures and feedback | B11 |
| Test suite and skill-selection benchmark | Keep | S7 |
| Design presets for UI projects | Drop; Capture replaces them | None |
| Agentation overlay for React projects | Drop; Feedback replaces it | FR23 to FR31 |

Further behaviours found in the source:

| Behaviour today | Proposed decision | Luci requirement |
| --- | --- | --- |
| Skill packs offered at init and managed by command | Keep | S8 |
| Skill import from GitHub, with five trust levels | Keep | S9 |
| Ranking levels and review of AI-drafted skill fields | Keep | S10 |
| Skills that do the same job are never loaded together | Keep | S2 |
| Selection capped at four skills and an 8,000-token budget per task | Keep as defaults | S3 |
| Active task file is local, never committed, and archived when done or replaced | Keep | B9 |
| A design.md built from the project's own stylesheets | Keep, in Luci's format | B14 |
| Agents can update project memory through the local server | Keep, with review | B15 |
| Migration from the older memory layout | Change: becomes the base of the import command | B13 |
| Twenty unit test files, two integration tests, and a benchmark with a recorded baseline | Keep; port to Vitest | S7 |
| Design presets: registry, commands and 63 preset files | Drop | None |

To finish this test:

- [ ] Change any proposed decision you disagree with.
- [ ] Add behaviours you rely on that the README does not mention.
- [ ] For each Keep, write one sentence describing the result you expect, which becomes its test.
- [ ] Note every problem you hit while building Luci with the prototype, as a new row.

## Test 2: multi-page prompt test

This test checks, before any code exists, that Luci's prompt format gets feedback from three pages applied in full. It passes when all six items are applied and reported in 10 of 10 runs.

**Setup**

1. Pick one of your React projects with at least three pages, and create a clean Git branch for the test.
2. Choose two small, visible fixes on each page, six in total. Use changes that are easy to verify by eye, such as a label, a colour or a gap.
3. Fill in the template below with your real routes, files, selectors and fixes.
4. For the comparison, annotate the same six fixes with Agentation and paste the three pages' outputs together, unedited.

**Luci prompt template**

```
# UI feedback: 3 pages, 6 items
Apply every item below, on all 3 pages. Do not stop after the first page.

## Page 1 of 3: <route>  (<source file>)
- [P1-A1] <fix or change>, <high, medium or low>: "<what to change>"
  selector: <css selector>
  text: "<visible text of the element>"
- [P1-A2] <fix or change>, <priority>: "<what to change>"
  selector: <css selector>
  text: "<visible text of the element>"

## Page 2 of 3: <route>  (<source file>)
- [P2-A1] ...
- [P2-A2] ...

## Page 3 of 3: <route>  (<source file>)
- [P3-A1] ...
- [P3-A2] ...

## When done
Report every item ID as done, skipped or blocked, grouped by page,
and name the route to open to verify it.
End with the number of items done out of 6.
```

**Each run**

1. Reset the branch so the six fixes are undone.
2. Start a new agent session, so nothing carries over.
3. Paste the prompt and let the agent finish without further messages.
4. Open the three pages and count the fixes that were really applied.
5. Count the item IDs in the agent's final report.

Do ten runs with the Luci prompt and five with the pasted Agentation output.

**Score sheet**

| Run | Format | Applied (of 6) | Reported (of 6) | Notes |
| --- | --- | --- | --- | --- |
| 1 | Luci |  |  |  |
| 2 | Luci |  |  |  |
| 3 | Luci |  |  |  |
| 4 | Luci |  |  |  |
| 5 | Luci |  |  |  |
| 6 | Luci |  |  |  |
| 7 | Luci |  |  |  |
| 8 | Luci |  |  |  |
| 9 | Luci |  |  |  |
| 10 | Luci |  |  |  |
| 11 | Agentation |  |  |  |
| 12 | Agentation |  |  |  |
| 13 | Agentation |  |  |  |
| 14 | Agentation |  |  |  |
| 15 | Agentation |  |  |  |

**Reading the result**

| Outcome | What it means | Next step |
| --- | --- | --- |
| Luci 10 of 10, Agentation lower | The format fixes the problem | Build the format as specified |
| Luci below 10 of 10 | The pasted prompt alone is not enough | Make agent sync through the local server the main path |
| Both 10 of 10 | The problem did not reproduce here | Repeat with the project and agent where you first saw it |

# Part 4: Build brief for the coding agent

## How to use this document

Build Luci one milestone at a time from Part 1, moving the prototype's code in where the source map below says so. Parts 1 and 4 are instructions, Part 2 is background, and Part 3 holds tests for a person to run.

1. **Work in milestone order, M1 to M6.** Do not start a milestone until the previous one meets its "Done when" line and every test passes.
2. **Port, do not rewrite.** For a module marked Port, move the code and its tests, convert both to strict TypeScript, and apply the renames. Change behaviour only where a requirement says so.
3. **Protect selection quality.** After any change to the skills package, run the benchmark. The port must first reproduce the prototype's recorded baseline on the prototype's own library: hit rate 0.966 on the 36 tuning cases and 0.941 on the 22 held-out cases. From then on, scores on Luci's design library must not fall below Luci's recorded baseline.
4. **Keep it local.** No network calls, telemetry, accounts or cloud storage. No new runtime dependency without a stated reason.
5. **Respect licences.** Do not copy a skill into Luci's library unless its licence allows redistribution.
6. **Use the new names only.** Product code, files and output never mention the prototype's name. The import command (B13) is the one place that reads the old layout.
7. **Ask first** before deleting files, changing a format schema, or changing a requirement.
8. **Record decisions** in the project's memory as you make them.

## Renames

| In the prototype | In Luci |
| --- | --- |
| `gaw` command | `luci` |
| `ai-brain/` project folder | `.luci/` |
| `~/.gaw/` global folder | `~/.luci/` |
| `GAW_HOME` variable | `LUCI_HOME` |
| `gaw.json` skill contract | `luci.json` |
| GAW Skill Standard (GSS) | Luci Skill Standard (LSS) |
| `guided-agent-workflow-mcp` server | `luci-mcp` |
| `guided-agent-workflow` package | `luci`, if the name is free on npm |

## Source map

The prototype is about 10,900 lines of JavaScript including tests, at commit 5276a50. Each row says where its code goes.

| Prototype path | Lines | Luci package | Action |
| --- | --- | --- | --- |
| `cli/`, `bin/` | 1,994 | `cli` | Port; split the single 1,600-line command file into one file per command |
| `core/bootstrapper`, `project-detector`, `project-analyzer`, `dependency-manager` | 734 | `brain` | Port |
| `core/project-context` | 1,015 | `brain` | Port; the layout migration becomes the base of import (B13); the design extractor writes Luci's format (B14) |
| `core/memory-engine` | 205 | `brain` | Port |
| `core/agent-adapters`, `integrations/` | 228 | `brain` | Port; Claude Code and Cursor in M1, the rest in v0.2 |
| `core/graphify-manager`, `cli/graphify-setup.js` | 385 | `brain` | Port as the built-in code map (B6) |
| `core/skill-registry` | 2,083 | `skills` | Port |
| `core/skill-discovery`, `orchestrator`, `skill-loader` | 850 | `skills` | Port |
| `core/packs`, `packs/` | 176 | `skills` | Port |
| `skills/` library, 219 skill files | n/a | `skills` | Port only skills with a redistribution licence |
| `mcp/server.js`, 18 tools | 494 | `mcp` | Port, then add tools for captures and feedback |
| `tests/`, `eval/` | 2,032 | each package | Port to Vitest; keep every case and the baseline |
| `brain/` defaults, `templates/ai-brain` | n/a | `brain` | Port with renames |
| `core/preset-registry`, `presets/` | 228 | none | Drop |
| `core/agentation-manager`, `templates/agentation` | 159 | none | Drop; replaced by `feedback` and `toolbar` |
| `templates/legacy-project-brain` | n/a | none | Drop |
| Not in the prototype | n/a | `format`, `capture`, `feedback`, `extension`, `toolbar` | Write new |

## Target repository layout

```
luci/
  packages/
    format/      schemas and formatters for every file Luci writes
    brain/       setup, memory, agent files, code map
    skills/      standard, registry, selection, packs, library
    mcp/         the local server
    cli/         the luci command
    capture/     picker, extractors, basket
    feedback/    annotations, prompt builder, item status
    extension/   browser extension shell
    toolbar/     dev toolbar shell for React projects
  eval/          selection benchmark cases and baseline
  docs/
```

## First tasks (milestone M1)

1. Create the monorepo: pnpm workspaces, strict TypeScript, Vitest.
2. Create `format` with Zod schemas for the memory folder's files.
3. Port project detection, the bootstrapper and the memory layout into `brain`, with their tests, applying the renames.
4. Port the memory engine and the link between global and project memory.
5. Port the agent file writers for Claude Code and Cursor.
6. Port `init` and `doctor` into `cli`.
7. Run the ported tests, then run `luci init` on a sample project and confirm an agent reads `.luci/`.

## What the agent needs at kickoff

- [ ] The path to the prototype's source on your machine, at commit 5276a50 or later.
- [ ] An empty repository for Luci.
- [ ] This document saved inside that repository.
- [ ] A note of any prototype changes that are not yet pushed, since this brief was written from the public repository.
