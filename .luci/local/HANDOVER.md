# Handover: continuing the Luci build (2026-11-14)

Read this file first, then `.luci/rules.md`, `.luci/context.md`, and `.luci/decisions/2026-11-14-brand-kit-design-system.md`. This folder (`.luci/local/`) is git-ignored: these notes stay on this machine.

## 1. Where things stand

- **Project:** Luci, a local-first toolkit for AI coding agents: project memory, skill selection, design capture (browser extension and dev toolbar) and UI feedback. Spec: `docs/PRD.md` (Part 4 is the build brief). Monorepo, pnpm, TypeScript, vitest, Playwright, Preact; 10 packages including `@luci/ui` (see `.luci/context.md`).
- **Done (all committed locally on `main`, never pushed; `HEAD` is `908b947`):**
  - `v0.1` (`M1` to `M6`), `v0.2`, and **all of `v0.3` (`v0.3.1` to `v0.3.6`)**:
    - `60aa450` — **v0.3.1 Design check (`FR33`)**
    - `f02efed` — **v0.3.2 Capture to rule (`FR34`)**
    - `8cb6a6c` — **v0.3.3 Multi-page system merge (`FR35`)**
    - `effb99f` — **v0.3.4 Responsive capture (`FR36`)** (plus extension-test fixes `2a16df1`, `e594f57`)
    - `91862f0` — **v0.3.5 Conflict detection (`B12`)** (`packages/brain/src/memory/conflicts.ts`, wired into `diagnose.ts` and `projectContext.ts`, tested in `brain/test/conflicts.test.ts` and `cli/test/doctor.test.ts`)
    - `ec0684f` — **v0.3.6 Source paths beyond React (`FR25`: Vue 3 & Svelte 4/5)** (`packages/feedback/src/vue.ts`, `packages/feedback/src/svelte.ts`, `target.ts`, `layout/catalog.ts`, plus in-memory esbuild test fixtures in `packages/feedback/fixtures/vue-app/` and `svelte-app/`, tested in `feedback/test/feedback.test.ts`)
    - `9034ba6` — **IDE TypeScript project references fix** (added `{ "path": "./tsconfig.test.json" }` to root `tsconfig.json` and excluded `fixtures/**/*.vue` so VS Code's TS language server resolves `tsconfig.test.json` cleanly for all `packages/*/test/*.test.ts`)
  - **Luci Brand Kit Design System (`@luci/ui` + `brand/`, commits `27fe5b1`..`908b947`):**
    - `27fe5b1` — **Design system foundation**: `brand/` (read-only source of truth) and `@luci/ui` generated via `pnpm brand:sync` (`scripts/brand-sync.mjs`): tokens (palette, light and dark roles, type, radius, motion), layered `Mascot` component (`packages/ui/src/mascot/`), base & component styles, copy, extension icons, and `packages/ui/test/ui.test.ts`.
    - `dc69b97` — **Restyled surfaces with the brand kit**: capture toolbar, Feedback, Layout, sketch canvas, dev toolbar launcher and connecting pill, extension help page and icons.
    - `26ffba8` — **Brand kit icons, fonts, Charcoal toolbar pill, and button primitives**: Lucide icons from `brand/luci-icons.json` through generated `packages/ui/src/icons.ts` (the only file allowed to import `lucide-preact`) and `Icon` wrapper (`1.75` stroke, `currentColor`, `22/20/16px`); `Fredoka`, `Inter`, and `JetBrains Mono` bundled (OFL) in `packages/ui/src/fonts/` and registered via `FontFace` from bytes; `Button` primitive (`primary`, `secondary`, `outline`, `ghost`, `danger`, `link`, `sm/md/lg`, icon-only and with-icon); Charcoal toolbar pill with `ginger-400` active state and Collar Lime basket pill; animated `Mascot` moments (hello greeting, sitting in menu, measuring beside Spacing hint, in-the-box empty basket, peeking for no notes, asleep while Whole page reads, annoyed when capture fails); `Pixel` colour loupe (`15x15` at `8x`).
    - `908b947` — **Brand kit shortcuts, pressed states, tooltips, and Feedback/Layout icons** (completed and committed when Claude Code's session hit usage limit):
      - Added `packages/ui/src/shortcuts.ts` (`useShortcuts`, `shortcutFor`, `typingIn`): single-key shortcuts for Capture (`V`, `T`, `C`, `S`, `P`, `K`, `B`, `M`), Feedback (`A`, `N`, `P`, `M`), and Layout (`S`, `I`, `N`)—active only while the surface is open, never while typing or with modifiers. Tooltips show `Name  Key`, buttons carry `aria-keyshortcuts`, and the Luci menu lists them.
      - Added 6 approved icons to `brand/luci-icons.json` & `packages/ui/src/icons.ts`: `notes` (`list`), `select` (`mouse-pointer-click`), `new-page` (`file-plus`), `redo` (`redo-2`), `reset` (`rotate-ccw`), and `chevron` (`chevron-down`).
      - Feedback (`packages/feedback/src/ui/feedback.tsx`) and Layout (`packages/feedback/src/ui/layout.tsx`) pills are now icon-only with count badges.
      - Added `Select` component (`packages/ui/src/components.tsx`) wrapping `<select>` with the `chevron-down` icon.
      - Unified "on" state (`ginger-400` with Charcoal text, including on hover) across tools, toggles, and segments; fixed tooltip `z-index` layering above cards; memoized `Mascot` and `Face` SVG markup per instance so `document.getAnimations()` does not restart on re-renders.
- **Builds & Tests:**
  - `pnpm typecheck` passes with 0 errors.
  - All modified test suites (`packages/ui/test/ui.test.ts`, `packages/capture/test/toolbar.test.ts`, `packages/toolbar/test/layout.test.ts`, `packages/toolbar/test/devToolbar.test.ts` — 44 tests) verified green.
  - `packages/toolbar/dist/luci-toolbar.js` and `packages/extension/.output/chrome-mv3` are freshly built; `graphify-out/` code map is current.
  - Working tree is clean (`HEAD` is `908b947`).

---

## 2. Key Brand Kit Rules (`@luci/ui` & `brand/`)

Full record: `.luci/decisions/2026-11-14-brand-kit-design-system.md` (decisions 1–20), enforced by `packages/ui/test/ui.test.ts`:
- `brand/` is read-only unless the user approves kit updates (like `brand/luci-icons.json`). Always run `pnpm brand:sync` (`node scripts/brand-sync.mjs`) after updating `brand/` to regenerate `packages/ui/src/tokens.{css,ts}`, `packages/ui/src/icons.ts`, `packages/ui/src/mascot/art.ts`, and `packages/extension/public/`.
- **No hex colours outside tokens** (`tokens.css` / `tokens.ts`), and **no coloured or Charcoal strokes on components** (page overlays like pick highlight, padding/margin, layout handles, and inserted placeholders are exempt).
- **`packages/ui/src/icons.ts` is the only file allowed to import `lucide-preact`** (enforced by test).
- **Danger buttons** keep the solid `#c34545` Pastel Red fill (`#ae3b3b` hover) and `#f5efea` text as requested by the user.
- **Unlimited Copy** and **`View in Basket`** active button state after adding an item are preserved and tested in `packages/capture/test/toolbar.test.ts`.

---

## 3. What is next: Kept Roadmap List (wait for the user's go)

Do not start any of these until the user says which one to tackle next. And do **not** start Public Release Prep until the user explicitly asks for it.

1. **`B14` — Monorepo & Sub-package Scoping (`packages/brain` + `packages/cli` + `packages/mcp`)**
   - Support per-package rules/context in workspaces (e.g., `packages/*` or `apps/*`) so `luci start` and `get_project_context` load the root rules plus the active package's stack and rules when working inside a sub-package.
2. **Post-v0.3 Design Workflow Enhancements (`v0.4.1–v0.4.4`):**
   - **`v0.4.1` Watch & Auto-check:** Re-run Design Check (`checkCapture`) when source files change during `luci serve` and update feedback items automatically.
   - **`v0.4.2` Multi-page Crawl:** Capture a list of routes/URLs in one pass and merge into a site-level `DESIGN.md` system.
   - **`v0.4.3` Computed Layout Tree (`flex` / `grid`):** Include parent/child flex and grid layout relationships inside component and section captures.
   - **`v0.4.4` Screenshot Diff Overlay:** Visual pixel/overlay comparison alongside token diffing in Design Check.
3. **Google Stitch `DESIGN.md` Prose Export Compatibility**
   - Optional prose-first export format alongside Luci's structured tables so teams using Google Stitch or prose-based `DESIGN.md` workflows can export directly.
4. **On hold (do not build until asked):**
   - Public Release Prep (fresh public repo from a clean snapshot without local paths, third-party skill licence check, GitHub / npm / Chrome Web Store).
   - "Send to project" button in the browser extension when `luci serve` runs.
   - Making the `debugger` permission optional before a Chrome Web Store release.

---

## 4. How the user works with agents (keep to this)

- **Explain before changing.** A question or concern gets an explanation, options and a recommendation; make no edits until the user says "go" (or "do it").
- **Do not edit `.luci/local/active-task.md` if the user has it open in an editor tab** (editing an open dirty/unsaved tab triggers VS Code's *"Failed to save 'active-task.md': The content of the file is newer"* toast).
- **Plain, short answers.** Tables help. Say plainly what was done and verified.
- **Never push.** Commit locally after each finished step. No new dependencies without asking.
- **The user tests in real Chrome** and sends screenshots of results or design adjustments.

---

## 5. Environment gotchas (Windows)

- **Shell is Windows PowerShell 5.1.** Never edit repo files with `Get-Content`/`Set-Content` (they corrupt UTF-8 characters like `—`, `→`, `×`, `✓`). Use your file-edit tool, or Node with `'utf8'`.
- In PowerShell 5.1, use `;` (not `&&`) to chain commands.
- **Loaded-extension tests** (`pnpm test:extension`, opt-in) hang inside agent sandboxes; the user runs them in real Chrome.
- **Verification before committing:** Run `pnpm check`, rebuild `pnpm --filter @luci/extension build`, and run `graphify update .`.
