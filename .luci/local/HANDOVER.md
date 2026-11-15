# Handover: continuing the Luci build (2026-11-15)

> [!IMPORTANT]
> **CRITICAL NOTE FOR CLAUDE CODE (DO NOT RESUME THE UNFINISHED SESSION WORK):**
> *Timestamp: Claude Code session stopped at **3:26 AM (2026-11-15)** due to token limit.*
> Do **NOT** attempt to resume, recreate, or reapply the uncommitted edits you were working on at 3:26 AM (the basket card layout reorder and the help page Node 18+ notice).
> **All of that work was completed, verified, and committed in `2eab681`.**
> Furthermore, two subsequent UI/UX fixes requested by the user were completed:
> 1. `6e9ae9f`: Panel position `Right` is selected/active by default and reflects the dragged side.
> 2. `d8c8eae`: Tooltip container expansion (`max-width: 340px; white-space: pre-wrap`) fixing the Pause tooltip text overflow.
> All 15 commits are tested (502 tests green) and pushed to GitHub `origin/main`.
> Read this file, inspect the git history (`git log --oneline -15`), and **wait for the user's next instructions** rather than restarting old work.

---

## 1. Where things stand

- **Project:** Luci, a local-first toolkit for AI coding agents: project memory, skill selection, design capture (browser extension and dev toolbar) and UI feedback. Spec: `docs/PRD.md` (Part 4 is the build brief). Monorepo, pnpm, TypeScript, vitest, Playwright, Preact; 10 packages including `@luci/ui` (see `.luci/context.md`).
- **Git State:** `HEAD` is pushed to GitHub `main` (clean working tree).
- **Recent Commit History (15 commits):**
  - `a8a4a9e` — **Propose rule**: push only when the user says so.
  - `b9caf0e` — **Brand kit**: a Luci pose for every tool, and Lucifer on his collar.
  - `d13596a` — **Dev toolbar**: centred mode switch, placed at the bottom where Luci waits, and description cards for every mode.
  - `a46227f` — **`luci toolbar`**: add/remove the dev toolbar in an app without editing code (Next.js, SvelteKit, Astro, HTML), offered in `init` and `serve`.
  - `73f0431` — **Fix**: opening the extension closes the dev toolbar into its button and vice-versa (one Luci on page at a time).
  - `3e6dff9` — **Fix**: note markers float on elements properly; dev toolbar panels open upwards from the bar.
  - `3e9b478` — **Decision record**: dev toolbar panels open from the bar (`.luci/decisions/2026-11-15-dev-toolbar-placement-and-setup.md`).
  - `fc7e648` — **Extension**: drag the bar anywhere in the window, kept per site in UI preferences.
  - `b0a4ee2` — **Luci v0.3.0**: version pill with GitHub mark, "Take Luci home" in extension menu, draggable dev toolbar, settings row wrap fix.
  - `1e3672a` — **Third-party notices**: credit Graphify (code map) and uv in `THIRD_PARTY_NOTICES.md`.
  - `4bd9a19` — **Panel position reads `Left | Right`** (screen order); menu no longer scrolls sideways from repo pill tooltip; dev toolbar button draggable without opening bar.
  - `2eab681` — **Basket & Help page update**: (finished what Claude Code left off) basket items show meta on top, name and export/remove buttons in one row, note textarea below; help page notes Node 18+ requirement.
  - `6e9ae9f` — **Panel position default**: `Right` tab is selected with active state by default (`aria-pressed={prefs.dock === d.id}` without unselecting when custom-placed); follows the dragged side of the screen across Extension and Dev Toolbar.
  - `d8c8eae` — **Tooltip container fix**: expanded tooltip container `max-width: 340px; box-sizing: border-box; white-space: pre-wrap;` so long button hints (such as Pause: *"Pause  Freezes the page's animations"*) fit comfortably without text overflowing the dark pill.

---

## 2. Environment & Testing Verification

- **Global CLI:** `packages/cli` has been linked globally via `npm link` so `luci` is a recognized command in terminal / PowerShell on this machine.
- **Next.js Integration Tested:** `E:\vht - Copy` was initialized with `luci init`, `luci serve` runs on port 4545, and `Script` tag was wired into `apps/web/src/app/layout.tsx`.
- **Test Suite Status:**
  - `pnpm typecheck` passes with 0 errors.
  - `pnpm test` passes cleanly: **58 test files passed (502 tests passed, 6 skipped)**.
- **Builds:**
  - `packages/toolbar/dist/luci-toolbar.js` freshly built.
  - `packages/extension/.output/chrome-mv3` freshly built.
  - `graphify-out/` code graph is current.

---

## 3. What is next: Roadmap (Wait for User Approval)

Do not start any of these until the user explicitly directs which one to tackle next:

1. **`B16` — Monorepo & Sub-package Scoping (`packages/brain` + `packages/cli` + `packages/mcp`) — COMPLETED (2026-11-15)**
   - Project root discovery via `findProjectRoot` walking up directory ancestors.
   - Package-scoped rules under `## Package: <path-or-name>` in root `.luci/rules.md`.
   - `activePackage` stack and rules reported in `get_project_context`, `luci start`, and `luci doctor`.
   - CLI commands (`task`, `skills`, `capture`, `map`, `serve`) resolve root `.luci/`.
   - 14 tests in `packages/brain/test/workspace.test.ts` and `packages/cli/test/workspace.test.ts` + MCP workspace test. Total 566 tests passing.
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

## 4. How the user works with agents (Strict Rules)

- **Explain before changing.** A question or concern gets an explanation, options, and a recommendation; make no edits until the user says "go" (or "do it").
- **Do not edit `.luci/local/active-task.md` if the user has it open in an editor tab** (prevents file conflict toasts).
- **Plain, short answers.** Tables help. Say plainly what was done and verified.
- **Push only when the user explicitly asks.** Commit locally after each finished task.
