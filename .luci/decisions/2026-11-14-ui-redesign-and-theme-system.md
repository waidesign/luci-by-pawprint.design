# 2026-11-14: UI/UX Redesign, Settings Panel, and Warm Off-White / Charcoal Theme System

## Context
To make Luci approachable and visually refined for UI/UX, Product, Web, and Front-end Designers prior to launch, we redesigned the Browser Extension and Dev Toolbar UI based on the two layout wireframes while preserving full backward compatibility with all existing tests and workflows.

## Decisions
1. **Context-Aware Branding:**
   - **Browser Extension** (`!props.modes`): Shows `<LuciLogo />` + **`DESIGN.md Extractor`** with **`by Luci`** subtitle, concise one-line description, and version badge (`v0.3.0`).
   - **Dev Toolbar** (`props.modes` present): Shows compact `<LuciLogo compact />` + **`Luci`** alongside the `Feedback · Layout · Capture` mode switch.
2. **Settings Panel (`⚙`) & Shared Appearance Controls:**
   - Added `packages/capture/src/ui/theme.tsx` exporting `useUiPrefs`, `<LuciLogo />`, and `<AppearanceControls />`, persisted in `localStorage` (`luci.ui`) and synced across shadow roots via a custom `luci-ui-prefs` document event.
   - Added a `⚙` Settings toggle (`[data-action="settings"]` / `[data-part="settings"]`) in Capture toolbar and harmonized Feedback mode's Settings panel (`packages/feedback/src/ui/feedback.tsx`) with:
     - **Appearance:** `System` · `Light` · `Dark` (`data-theme-choice="system|light|dark"`).
     - **Panel position:** `Right` · `Left` dock (`data-dock-choice="right|left"`).
     - **Default export format:** `Units` (`px`/`rem`), `Colors` (`hex`/`rgb`/`hsl`/`oklch`), `Source` (`page address`/`domain only`/`none`).
     - **Quick keys:** `↑` `↓`, `Enter`, `Esc`.
3. **Wireframe Layout Alignment:**
   - **Unified Floating Shell (`.shell`):** Header, single-row tool tabs, tool hint, and active panel flow inside one clean floating card (`500px` max width on desktop, responsive full-width on mobile).
   - **Selected Item Card (Wireframe 2):** Bordered `.selected-card` with `↑ Wider` / `↓ Narrower` (`or use the ↑ ↓ keys`), `This one` / `The whole system` / `This section` / `Pick again`, and a muted `.tip-box`.
   - **Extracted `.md` View (Wireframe 1):** 3-column `Units | Colors | Source` grid, `States in this file` with `Default ✓` + interactive state pills, `Capture manually` horizontal row, `Your instructions for agent (optional)`, and a tinted bottom `.md-section` with `Copy | Download | Add to basket | Pick again`.
4. **Strict Off-White & Charcoal Palette Rule:**
   - Zero pure white (`#FFFFFF` / `#fff`) or pure black (`#000000` / `#000`) anywhere in `TOOLBAR_CSS`, `FEEDBACK_CSS`, `devToolbar.ts`, or `help.html`.
   - Light mode uses warm alabaster/off-white (`#FAF9F5`, `#F1EFE9`, `#F6F5F0`) with `#18181B` ink; Dark mode uses rich charcoal (`#18181B`, `#141417`, `#121215`, `#202024`) with `#F4F4F5` ink.
