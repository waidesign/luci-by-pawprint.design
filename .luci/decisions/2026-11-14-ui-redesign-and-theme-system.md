# 2026-11-14: UI/UX Redesign, Settings Panel, and Muzzle White (`#F5EFEA`) / `#2b2b2b` Theme System

## Context
To make Luci approachable and visually refined for UI/UX, Product, Web, and Front-end Designers prior to launch, we redesigned the Browser Extension and Dev Toolbar UI based on the two layout wireframes while eliminating all purple "AI slop" outlines/fills and pure `#FFFFFF`/`#000000`.

## Decisions
1. **Context-Aware Branding & Subtitle:**
   - **Browser Extension** (`!props.modes`): Shows architectural `<LuciLogo />` + **`DESIGN.md Extractor`** with **`by Luci`** subtitle, description *"Component-level DESIGN.md extractor to connect with Luci's agentic workflow for design & front-end development."*, and version badge (`v0.3.0`).
   - **Dev Toolbar** (`props.modes` present): Shows compact `<LuciLogo compact />` + **`Luci`** alongside the `Feedback · Layout · Capture` mode switch.
2. **Settings Panel (`⚙`) & Shared Appearance Controls:**
   - Added `packages/capture/src/ui/theme.tsx` exporting `useUiPrefs`, `<LuciLogo />`, and `<AppearanceControls />`, persisted in `localStorage` (`luci.ui`) and synced across shadow roots via a custom `luci-ui-prefs` document event.
   - Added a `⚙` Settings toggle (`[data-action="settings"]` / `[data-part="settings"]`) in Capture toolbar and harmonized Feedback mode's Settings panel (`packages/feedback/src/ui/feedback.tsx`) with Appearance (`System / Light / Dark`), Panel position (`Right / Left`), Default export format, and Quick keys.
3. **Muzzle White (`#F5EFEA`) & `#2b2b2b` Primary Palette (Zero Purple Slop, Zero Pure `#fff`/`#000`):**
   - Light mode uses Muzzle White (`#F5EFEA`) surface, warm stone subtle tint (`#EBE4DC`), warm cream fields (`#FAF6F2`), and `#2b2b2b` primary ink & buttons.
   - Dark mode uses deep charcoal (`#1F1F1F`, `#181818`, `#2B2B2B`) with Muzzle White (`#F5EFEA`) ink & primary buttons.
   - Active tabs use a clean borderless neutral fill (`#DED5CB` in Light, `#333333` in Dark), and state pills use a solid neutral `Default ✓` pill plus clean outlined cards for other detected states.
