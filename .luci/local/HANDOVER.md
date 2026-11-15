# Handover: continuing the Luci build (2026-11-15 19:15)

> [!IMPORTANT]
> **CRITICAL NOTE FOR CLAUDE CODE:**
> All work through **v0.4.4** is complete, verified (67/67 test files passing, 598 tests passed), committed locally, and pushed to GitHub `origin/main` (latest commit: `bd32d3d`).
> Working tree is 100% clean. Do **NOT** attempt to re-implement or roll back any recent work.
> Read this file, inspect `git log --oneline -10`, and wait for the user's explicit instructions.

---

## 1. Where Things Stand

- **Project:** Luci — local-first toolkit for AI coding agents: project memory, skill selection, design capture (browser extension & dev toolbar), and UI feedback. Monorepo with 10 packages (`brain`, `skills`, `capture`, `feedback`, `format`, `cli`, `mcp`, `extension`, `toolbar`, `ui`).
- **Git State:** Clean working tree. Branch `main` is up to date with `origin/main`.
- **Latest Commit History on `main`:**
  - `bd32d3d` — **feat(v0.4.4)**: unified devtool settings tabs and consistent mascot eyebrow colors
    - DevToolbar settings dialog unified across all three modes (`feedback`, `layout`, `capture`):
      - Shared settings at top (outside tabs): Connected Project info card (`data-part="connected-project"`) and Appearance controls (`data-part="appearance-settings"`: System/Light/Dark theme, Left/Right dock).
      - Segmented tool tabs (`[ Feedback ]` | `[ Layout ]` | `[ Capture ]`): initial tab matches active canvas mode; lets user switch tabs and adjust any tool's settings without leaving the settings modal or disrupting canvas mode.
      - Extension settings modal remains single-tool (Capture settings only, no tabs).
    - Mascot eyebrow consistency fix: replaced all `#2B2B2B` strokes with canonical `#AD4F1A` (Ginger-700) across 30 SVG files (`brand/layered/`, `brand/animated/`, `brand/mascot/`, and `packages/ui`); ran `pnpm brand:sync`.
  - `5da323c` — **feat(v0.4.4)**: add toggle to disable/enable debugger in settings with full CSS fallback
    - Runtime toggle in Settings to disallow CDP attachment and fallback to stylesheet rules and hidden frames.
  - `86f0d48` — **feat(v0.4.4)**: optional debugger permission status, help request flow, and graceful fallback
    - Extension `#debugger-permission` help section and zero-CDP fallback.
  - `93a21ea` — **feat(v0.4.4)**: direct extension bridge: send captures and basket items directly to project via localhost:4545
    - Bridge `POST /design`, `POST /rule`, `GET /health`, custom bridge URL/port input in settings.
  - `418e37b` — **feat(v0.4.4)**: visual screenshot diff overlay in design check
    - Slider overlay with onion skin, split side-by-side, and difference inverted modes.
  - `7e680e8` — **feat(v0.4.3)**: computed layout tree (`flex` / `grid` structure extraction).
  - `eb6cf2a` — **feat(v0.4.2)**: multi-page crawl (`luci capture crawl`).
  - `976e985` — **v0.4.1 Watch & Auto-Check**: automatic reconciliation of feedback notes against design checks.

---

## 2. Environment & Testing Verification

- **Global CLI:** `packages/cli` is linked globally (`npm link`).
- **Test Suite:**
  - `pnpm typecheck`: 100% clean pass across all 9 packages, test tsconfig, built toolbars, and extension.
  - `pnpm test`: **67/67 test files pass** (598 passed, 6 skipped).
  - `pnpm --filter @luci/extension build`: Builds clean production bundle in ~1.4s.
- **Builds:**
  - `packages/toolbar/dist/luci-toolbar.js`
  - `packages/capture/dist/luci-capture.js`
  - `packages/extension/.output/chrome-mv3`

---

## 3. PRD Status & What is Next

All functional requirements (`FR1`–`FR36`, `B1`–`B16`, `S1`–`S10`) across **v0.1, v0.2, v0.3, and v0.4** are 100% implemented and tested.

### What remains (on hold until user explicitly directs):
1. **Public Launch & Distribution:**
   - **npm Package Publication (`luci` CLI):** publish global CLI package to npm.
   - **Chrome Web Store Submission:** package `@luci/extension` for Web Store review, prepare store promotional assets and privacy disclosures.
   - **Repository Sanitization for Open-Source:** clean up local test paths in fixtures and review licenses.
2. **Post-MVP Feature Ideas (PRD later steps):**
   - **Design System to Project Skill (PRD Rank 2):** generate whole-system `.luci/skills/<name>/SKILL.md` from multi-page captures.
   - **Full Screenshot Extraction (PRD Rank 9):** visual estimation of typography and layout without DOM.

---

## 4. How the User Works with Agents (Strict Rules)

- **Explain before changing.** Provide clear explanation and recommendations; make no edits until user says "go" or approves.
- **Do not edit `.luci/local/active-task.md` if the user has it open in an editor tab.**
- **Commit locally, verify with tests/typecheck, report for review, and push ONLY when the user explicitly confirms.**
- **Zero raw color values in UI code (strict token purity).**
