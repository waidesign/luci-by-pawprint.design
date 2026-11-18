/**
 * The toolbar's styles. They live in its shadow root, so the page and the toolbar never affect each
 * other. Built on @luci-dev/ui (tokens, base and components from the brand kit): this file only lays out
 * the toolbar's own parts, with var(--luci-*) values and no colours of its own.
 */
import { UI_CSS } from '@luci-dev/ui';

export const TOOLBAR_CSS = `
:host { all: initial; }
${UI_CSS}
/* Compact, as the kit gives for the toolbar panel: 32 px buttons, small labels, small body text */
.luci-theme { --luci-btn-h: 32px; --luci-btn-font: var(--luci-type-small-size); --luci-btn-line: var(--luci-type-small-line); --luci-btn-pad: var(--luci-space-12);
  font-size: var(--luci-type-small-size); line-height: var(--luci-type-small-line); }

/* The shell: a column at the window's edge, the toolbar pill first, then cards */
.shell {
  position: fixed;
  top: var(--luci-space-12);
  right: var(--luci-space-12);
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--luci-space-8);
  max-width: calc(100vw - 24px);
  max-height: calc(100vh - 24px);
  /* The column itself is see-through: only the pill and the cards take the pointer */
  pointer-events: none;
}
.shell > * { pointer-events: auto; }
.luci-theme[data-dock="left"] .shell { right: auto; left: var(--luci-space-12); align-items: flex-start; }
.luci-theme[data-dock="left"] .bar,
.luci-theme[data-dock="left"] .sub,
.luci-theme[data-dock="left"] .panel { right: auto; left: var(--luci-space-12); }

/* The toolbar pill (the brand kit, On-page toolbar): Charcoal in both themes, float shadow, no stroke */
.bar {
  --luci-color-focus: var(--luci-color-muzzle-50);
  position: fixed;
  top: var(--luci-space-12);
  right: var(--luci-space-12);
  z-index: 2147483647;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  max-width: calc(100vw - 24px);
  padding: var(--luci-space-8);
  border-radius: 32px;
  background: var(--luci-color-bar);
  color: var(--luci-color-bar-ink);
  /* Charcoal in both themes, so always with the inner edge: it stays apart from a dark page */
  box-shadow: var(--luci-elevation-bar);
}
/* Above the cards, so the tools' tooltips are never under a card */
.shell > .bar { position: relative; z-index: 2; }
/* In the column the shell is what is placed: the bar's own offsets would move it a second time */
.luci-theme .shell > .bar { inset: auto; }
/*
 * The extension's bar, dragged anywhere (data-h and data-v: the corner it is nearest). Cards open on
 * the side with room: below a bar in the top half, above one in the bottom half, aligned to its side.
 */
.luci-theme .shell[data-v="bottom"] { flex-direction: column-reverse; }
.luci-theme .shell[data-h="left"] { align-items: flex-start; }
.luci-theme .shell[data-h="right"] { align-items: flex-end; }
.luci-theme .shell[data-movable] > .bar { cursor: grab; touch-action: none; }
.luci-theme .shell[data-moving] > .bar, .luci-theme .shell[data-moving] > .bar * { cursor: grabbing; user-select: none; }
.luci-theme .shell[data-v="bottom"] > .bar [data-tip]:not([data-tip-align])::after { top: auto; bottom: calc(100% + var(--luci-space-8)); transform: translate(-50%, 4px); }
.luci-theme .shell[data-v="bottom"] > .bar [data-tip]:not([data-tip-align]):is(:hover, :focus-visible)::after { transform: translate(-50%, 0); }
.luci-theme .shell[data-v="bottom"] > .bar [data-tip][data-tip-align="left"]::after { top: auto; bottom: calc(100% + var(--luci-space-8)); left: 0; right: auto; transform: translate(0, 4px); }
.luci-theme .shell[data-v="bottom"] > .bar [data-tip][data-tip-align="left"]:is(:hover, :focus-visible)::after { transform: translate(0, 0); }
.luci-theme .shell[data-v="bottom"] > .bar [data-tip][data-tip-align="right"]::after { top: auto; bottom: calc(100% + var(--luci-space-8)); left: auto; right: 0; transform: translate(0, 4px); }
.luci-theme .shell[data-v="bottom"] > .bar [data-tip][data-tip-align="right"]:is(:hover, :focus-visible)::after { transform: translate(0, 0); }
.luci-theme .bar button { --luci-btn-h: 40px; color: var(--luci-color-bar-ink); }
.luci-theme .bar .tool, .luci-theme .bar .menu-btn { --luci-btn-h: 48px; }
.luci-theme .bar button:hover:not(:disabled) { background: var(--luci-color-bar-hover); }
.luci-theme .bar button:disabled { color: var(--luci-color-muzzle-500); }
.luci-theme .bar button[aria-pressed="true"],
.luci-theme .bar button[aria-pressed="true"]:hover:not(:disabled) { background: var(--luci-color-tool-active); color: var(--luci-color-on-tool-active); }
.luci-theme .bar .btn-primary { background: var(--luci-color-primary); color: var(--luci-color-on-primary); }
.luci-theme .bar .btn-primary:hover:not(:disabled) { background: var(--luci-color-primary-hover); }
/* Disabled on Charcoal: only the icon dims, so it never looks like an "on" state */
.luci-theme .bar .btn-primary:disabled { background: transparent; color: var(--luci-color-muzzle-500); }
.bar-sep { flex: none; width: 1px; height: 24px; margin: 0 2px; background: var(--luci-color-bar-stroke); }
/* Luci's head: the menu button */
.luci-theme .bar .menu-btn { display: inline-flex; align-items: center; justify-content: center; width: 48px; padding: 0; cursor: pointer; }
.luci-theme .bar .menu-btn .luci-avatar { transition: background-color var(--luci-motion-fast); }
.luci-theme .bar .menu-btn:is(:hover, [aria-pressed="true"]) { background: transparent; }
.luci-theme .bar .menu-btn:hover .luci-avatar { background: var(--luci-color-primary-hover); }
.luci-theme .bar .menu-btn[aria-pressed="true"] .luci-avatar { background: var(--luci-color-tool-active); }
/* The basket: a Collar Lime pill with its count */
.luci-theme .bar .basket-pill { display: inline-flex; align-items: center; gap: var(--luci-space-8); padding: 0 var(--luci-space-16) 0 var(--luci-space-12);
  background: var(--luci-color-accent); color: var(--luci-color-on-accent); font-weight: 600; }
.luci-theme .bar .basket-pill:hover:not(:disabled),
.luci-theme .bar .basket-pill[aria-pressed="true"],
.luci-theme .bar .basket-pill[aria-pressed="true"]:hover:not(:disabled),
.luci-theme .bar button.basket-pill[aria-pressed="true"]:hover:not(:disabled) { background: var(--luci-color-collar-lime-300); color: var(--luci-color-on-accent); }
.bar .basket-n { display: none; }
.brand { display: inline-flex; align-items: center; gap: var(--luci-space-8); padding: 0 var(--luci-space-8) 0 0;
  font: var(--luci-type-display-weight) var(--luci-type-heading-size)/1 var(--luci-font-display); color: var(--luci-color-bar-ink); }
/* The dev toolbar's mode switch, on Charcoal */
.bar .seg { background: var(--luci-color-muzzle-800); align-self: center; }
.luci-theme .bar .seg button { color: var(--luci-color-bar-ink); }
.luci-theme .bar .seg button[aria-pressed="true"],
.luci-theme .bar .seg button[aria-pressed="true"]:hover:not(:disabled) { color: var(--luci-color-on-tool-active); }
.modes { margin-right: var(--luci-space-4); }

/*
 * The dev toolbar is placed by its host: data-h and data-v name the corner it is nearest, --luci-x and
 * --luci-y its distances from that corner's edges (default bottom right, 12 px, by its button; the
 * person can drag it anywhere). Everything opens from the bar, on the side with room: cards just above
 * a bar in the bottom half, just below one in the top half, aligned to its side. A panel takes the
 * hint's place while it is open. --luci-bar-h is the bar's measured height (it can wrap), so a card
 * never opens under it. The extension sets none of this (its bar keeps its own place).
 */
:host([data-h="right"]) :is(.shell, .bar:not(.shell > .bar), .sub:not(.shell > .sub), .panel:not(.shell > .panel), .menu) { left: auto; right: var(--luci-x, 12px); }
:host([data-h="left"]) :is(.shell, .bar:not(.shell > .bar), .sub:not(.shell > .sub), .panel:not(.shell > .panel), .menu) { right: auto; left: var(--luci-x, 12px); }
:host([data-h="right"]) .shell { align-items: flex-end; }
:host([data-h="left"]) .shell { align-items: flex-start; }
:host([data-v="bottom"]) :is(.shell, .bar:not(.shell > .bar)) { top: auto; bottom: var(--luci-y, 12px); }
:host([data-v="bottom"]) .shell { flex-direction: column-reverse; }
:host([data-v="bottom"]) :is(.sub:not(.shell > .sub), .panel:not(.shell > .panel)) { top: auto; bottom: calc(var(--luci-y, 12px) + var(--luci-bar-h, 64px) + 8px); }
:host([data-v="bottom"]) .menu { top: auto; bottom: calc(var(--luci-y, 12px) + var(--luci-bar-h, 64px)); }
:host([data-v="top"]) :is(.shell, .bar:not(.shell > .bar)) { bottom: auto; top: var(--luci-y, 12px); }
:host([data-v="top"]) :is(.sub:not(.shell > .sub), .panel:not(.shell > .panel)) { bottom: auto; top: calc(var(--luci-y, 12px) + var(--luci-bar-h, 64px) + 8px); }
:host([data-v="top"]) .menu { bottom: auto; top: calc(var(--luci-y, 12px) + var(--luci-bar-h, 64px)); }
:host([data-v]) .shell { max-height: calc(100vh - var(--luci-y, 12px) - 12px); }
:host([data-v]) .panel:not(.shell > .panel) { max-height: min(72vh, calc(100vh - var(--luci-y, 12px) - var(--luci-bar-h, 64px) - 32px)); }
:host([data-v]) .layout-panel:not(.shell > .panel) { max-height: min(80vh, calc(100vh - var(--luci-y, 12px) - var(--luci-bar-h, 64px) - 32px)); }
:host([data-v]) .luci-theme:has(> .panel) > .sub:not([role="alert"]) { display: none; }
:host([data-v="bottom"]) :is(.sub, .panel, .menu) { animation: luci-rise var(--luci-motion-base, 200ms) both; }
:host([data-v="top"]) :is(.sub, .panel, .menu) { animation: luci-drop var(--luci-motion-base, 200ms) both; }
@keyframes luci-rise { from { opacity: 0; transform: translateY(8px); } }
@keyframes luci-drop { from { opacity: 0; transform: translateY(-8px); } }
@media (prefers-reduced-motion: reduce) { :host([data-v]) :is(.sub, .panel, .menu) { animation: none; } }
:host([data-v="bottom"]) .bar [data-tip]:not([data-tip-align])::after { top: auto; bottom: calc(100% + var(--luci-space-8)); transform: translate(-50%, 4px); }
:host([data-v="bottom"]) .bar [data-tip]:not([data-tip-align]):is(:hover, :focus-visible)::after { transform: translate(-50%, 0); }
:host([data-v="bottom"]) .bar [data-tip][data-tip-align="left"]::after { top: auto; bottom: calc(100% + var(--luci-space-8)); left: 0; right: auto; transform: translate(0, 4px); }
:host([data-v="bottom"]) .bar [data-tip][data-tip-align="left"]:is(:hover, :focus-visible)::after { transform: translate(0, 0); }
:host([data-v="bottom"]) .bar [data-tip][data-tip-align="right"]::after { top: auto; bottom: calc(100% + var(--luci-space-8)); left: auto; right: 0; transform: translate(0, 4px); }
:host([data-v="bottom"]) .bar [data-tip][data-tip-align="right"]:is(:hover, :focus-visible)::after { transform: translate(0, 0); }
/* The dev toolbar's bar can be dragged by its own background, a separator or Luci */
:host([data-v]) .bar { cursor: grab; touch-action: none; }
:host([data-v]) .bar button, :host([data-v]) .bar .menu-btn { cursor: pointer; }
:host([data-moving]) .bar, :host([data-moving]) .bar * { cursor: grabbing; user-select: none; }
/* New page's canvas covers the window: its tools and its panel keep clear of the bar */
:host([data-v="bottom"]) .wf { padding-bottom: calc(var(--luci-y, 12px) + var(--luci-bar-h, 64px) + 12px); }
:host([data-v="bottom"]) .wf-tools { padding-top: var(--luci-space-12); }
:host([data-v="top"]) .wf-tools { padding-top: calc(var(--luci-y, 12px) + var(--luci-bar-h, 64px) + 12px); }
:host([data-v="top"]) .panel[data-part="sketch-panel"]:not(.shell > .panel) { top: auto; bottom: var(--luci-space-12); }

/*
 * Phones and narrow windows (dev toolbar): the bar spans the window's width in two planned rows instead
 * of wrapping wherever it runs out of room. Row 1: Luci, the mode switch, Close. Row 2: the mode's tools,
 * spread evenly at the 44 px touch target. The first separator is the line break. Cards open full width
 * from the bar, above it (or below a bar dragged to the top).
 */
@media (max-width: 639px) {
  :host([data-v]) :is(.shell, .bar:not(.shell > .bar), .sub:not(.shell > .sub), .panel:not(.shell > .panel), .menu) { left: 8px; right: 8px; }
  :host([data-v]) :is(.sub:not(.shell > .sub), .panel:not(.shell > .panel)) { width: auto; }
  :host([data-v]) .shell { align-items: stretch; max-width: none; }
  :host([data-v]) .shell > :is(.sub, .panel) { width: auto; }
  :host([data-v]) .bar { justify-content: space-between; row-gap: var(--luci-space-4); column-gap: 0; padding: 6px; border-radius: var(--luci-radius-xl); max-width: none; }
  :host([data-v]) .bar > * { order: 3; }
  :host([data-v]) .bar > :is(.menu-btn, .modes) { order: 0; }
  :host([data-v]) .bar > [data-action="close"] { order: 1; }
  :host([data-v]) .bar > .modes + .bar-sep { order: 2; flex-basis: 100%; width: 0; height: 0; margin: 0; background: none; }
  :host([data-v]) .bar > .bar-sep:not(.modes + .bar-sep) { display: none; }
  :host([data-v]) .bar .modes { flex: 1 1 auto; margin: 0 var(--luci-space-4); }
  :host([data-v]) .bar .modes button { flex: 1 1 0; padding-inline: var(--luci-space-8); }
  :host([data-v]) .luci-theme .bar :is(.tool, .split .caret) { --luci-btn-h: 44px; }
  /* Where notes go, as its dot only (the words stay as its label) */
  :host([data-v]) .bar .conn { width: 28px; height: 44px; justify-content: center; padding: 0; font-size: 0; }
  :host([data-v]) .bar .conn::before { width: 10px; height: 10px; }
  /* Layout's inspector leaves the top of the page in view, where the selected element can be */
  :host([data-v]) .layout-panel:not(.shell > .panel) { max-height: min(45vh, calc(100vh - var(--luci-y, 12px) - var(--luci-bar-h, 64px) - 32px)); }
  /* The basket as its icon and count (its label still says "Basket, n items") */
  :host([data-v]) .luci-theme .bar .basket-pill { gap: var(--luci-space-4); padding: 0 var(--luci-space-12) 0 var(--luci-space-8); }
  :host([data-v]) .bar .basket-full { display: none; }
  :host([data-v]) .bar .basket-n { display: inline; }
}

/* Cards under the pill: the hint while picking, and every panel (radius-xl, float shadow, no stroke) */
.sub, .panel { background: var(--luci-color-surface); border-radius: var(--luci-radius-xl); box-shadow: var(--luci-elevation); }
.sub {
  position: fixed;
  top: 84px;
  right: var(--luci-space-12);
  z-index: 2147483646;
  width: min(420px, calc(100vw - 24px));
  display: flex;
  flex-direction: column;
  gap: var(--luci-space-8);
  padding: var(--luci-space-12) var(--luci-space-16);
}
/* In the column, cards drop the stand-alone z-index (flex items honour it even unpositioned) */
.shell > .sub { position: static; z-index: auto; width: min(560px, calc(100vw - 24px)); }
.sub p { margin: 0; }
.sub.with-luci { flex-direction: row; align-items: center; gap: var(--luci-space-16); }
/* Luci beside a hint inside a card (Layout: placing, new page) */
.luci-hint { display: flex; align-items: center; gap: var(--luci-space-16); }
.luci-hint > p { margin: 0; min-width: 0; }
.sub .sub-body { display: flex; flex-direction: column; gap: var(--luci-space-8); min-width: 0; }
.keys { color: var(--luci-color-ink-secondary); font-size: var(--luci-type-small-size); line-height: var(--luci-type-small-line); }
.panel {
  position: fixed;
  right: var(--luci-space-12);
  bottom: var(--luci-space-12);
  z-index: 2147483646;
  width: min(480px, calc(100vw - 24px));
  max-height: min(72vh, 660px);
  display: flex;
  flex-direction: column;
  gap: var(--luci-space-12);
  padding: var(--luci-space-20);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.shell > .panel { position: static; z-index: auto; width: min(560px, calc(100vw - 24px)); max-height: none; flex: 0 1 auto; min-height: 0; }
.panel > * { flex-shrink: 0; }
.panel > .items, .panel > .diffs { flex-shrink: 1; }
.panel h2 { margin: 0; font: var(--luci-type-title-weight) var(--luci-type-title-size)/var(--luci-type-title-line) var(--luci-font-display); }
.panel.result-panel { padding: 0; gap: 0; }
.panel-body { display: flex; flex-direction: column; gap: var(--luci-space-12); padding: var(--luci-space-20) var(--luci-space-20) var(--luci-space-16); }

/* The menu: who Luci is, help, then settings */
.menu-head { display: flex; align-items: center; gap: var(--luci-space-16); }
.menu-head > .repo-btn { align-self: flex-start; margin-left: auto; }
.settings-head { display: flex; align-items: center; justify-content: space-between; gap: var(--luci-space-12); }
.settings-head h2 { margin: 0; }
/* The extension's invitation: the rest of Luci lives in the person's project. A tint, no stroke, no pop-up */
.invite { display: flex; flex-direction: column; align-items: flex-start; gap: var(--luci-space-4); padding: var(--luci-space-12) var(--luci-space-16);
  border-radius: var(--luci-radius-lg); background: var(--luci-color-primary-soft); }
.invite p { margin: 0; }
.invite-title { font: var(--luci-type-display-weight) var(--luci-type-heading-size)/var(--luci-type-heading-line) var(--luci-font-display); color: var(--luci-color-ink); }
.invite-body { color: var(--luci-color-ink); }
.luci-theme .invite-action { margin-top: var(--luci-space-4); }
.brand-stack { display: flex; flex-direction: column; gap: var(--luci-space-4); min-width: 0; }
.brand-title-line { display: flex; align-items: baseline; gap: var(--luci-space-8); flex-wrap: wrap; }
.brand-title { font: var(--luci-type-title-weight) var(--luci-type-title-size)/var(--luci-type-title-line) var(--luci-font-display); color: var(--luci-color-ink); }
.brand-sub { font-size: var(--luci-type-small-size); line-height: var(--luci-type-small-line); font-weight: var(--luci-type-small-weight); color: var(--luci-color-ink-secondary); }
.brand-desc { margin: 0; color: var(--luci-color-ink-secondary); }
/* The first-run greeting */
.greet { flex-direction: row; align-items: center; gap: var(--luci-space-16); }
.greet .t-title { margin: 0; }
/* The words wrap beside Luci on a narrow window (panels keep their children's size otherwise) */
.greet > .stack { flex-shrink: 1; min-width: 0; }

/* Segmented control */
.seg { display: inline-flex; align-self: flex-start; gap: var(--luci-space-4); padding: var(--luci-space-4); background: var(--luci-color-surface-sunken); border-radius: var(--luci-radius-full); }
.luci-theme .seg button { min-height: 28px; padding: 5px var(--luci-space-12); }
.seg button::before { inset: -8px 0; }

/* Lists: basket items, section files */
.items { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--luci-space-8); overflow: auto; }
.items li { display: grid; grid-template-columns: 1fr auto; gap: var(--luci-space-8); align-items: center; padding: var(--luci-space-12);
  background: var(--luci-color-surface-raised); border: 1px solid var(--luci-color-stroke-subtle); border-radius: var(--luci-radius-lg); }
.files { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--luci-space-4); }
.files li { display: flex; gap: var(--luci-space-8); align-items: center; justify-content: space-between; padding: var(--luci-space-4) var(--luci-space-4) var(--luci-space-4) var(--luci-space-12);
  background: var(--luci-color-surface-raised); border: 1px solid var(--luci-color-stroke-subtle); border-radius: var(--luci-radius-md); }
.files li > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.files code, [data-part="file-view-box"] code { font: var(--luci-type-code-weight) 12px/1.5 var(--luci-font-code); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.items textarea { grid-column: 1 / -1; min-height: 40px; font-size: var(--luci-type-small-size); line-height: var(--luci-type-small-line); }
.items input { min-width: 0; }
/* A basket item: what it is, then its name with Export and Remove in one row, then its note */
.items .meta { grid-column: 1; color: var(--luci-color-ink-secondary); font-size: var(--luci-type-small-size); }
.items .meta:not(:has(+ .compare-pick)) { grid-column: 1 / -1; }
.items .compare-pick { grid-column: 2; justify-self: end; gap: var(--luci-space-4); font-size: var(--luci-type-small-size); }
/* Automatic design check (v0.4) */
.check-watch { gap: var(--luci-space-8); font-size: var(--luci-type-small-size); color: var(--luci-color-ink); }
/* Screenshot mode (v0.4): the hint card is where an image is dropped */
.sub.image-drop { outline: 2px dashed var(--luci-color-stroke-subtle); outline-offset: -6px; }
/* Compare mode (v0.4): What, A, B */
.compare-scroll { max-height: 50vh; overflow: auto; border-radius: var(--luci-radius-md); background: var(--luci-color-surface-sunken); }
.compare { width: 100%; min-width: 100%; table-layout: fixed; border-collapse: collapse; font-size: var(--luci-type-small-size); line-height: var(--luci-type-small-line); }
.compare th, .compare td { padding: var(--luci-space-4) var(--luci-space-8); text-align: left; vertical-align: top; box-sizing: border-box; }
.compare .col-what, .compare th:first-child, .compare td:first-child { width: 50%; overflow-wrap: break-word; word-break: normal; }
.compare .col-a, .compare .col-b,
.compare th:nth-child(2), .compare td:nth-child(2),
.compare th:nth-child(3), .compare td:nth-child(3) { width: 25%; overflow-wrap: anywhere; word-break: break-word; }
.compare th { position: sticky; top: 0; background: var(--luci-color-surface-sunken); color: var(--luci-color-ink-secondary); font-weight: 600; }
.compare tr + tr td { border-top: 1px solid var(--luci-color-stroke-subtle); }
.items .row { grid-column: 2; flex-wrap: nowrap; }
.stack { display: flex; flex-direction: column; align-items: stretch; gap: var(--luci-space-8); }

/* The file preview: code you can edit and drag taller */
textarea.preview { flex: none; height: 280px; min-height: 120px; max-height: 70vh; padding: var(--luci-space-12); white-space: pre; overflow: auto;
  background: var(--luci-color-surface-raised); font: var(--luci-type-code-weight) var(--luci-type-code-size)/var(--luci-type-code-line) var(--luci-font-code); }
textarea[data-part="instructions"] { min-height: 64px; }
pre.preview { margin: 0; max-height: 240px; overflow: auto; white-space: pre-wrap; }
pre { margin: 0; overflow: auto; padding: var(--luci-space-12); background: var(--luci-color-surface-sunken); border-radius: var(--luci-radius-sm); white-space: pre; min-height: 80px;
  font: var(--luci-type-code-weight) 12px/var(--luci-type-code-line) var(--luci-font-code); }

.dim { margin: 0; color: var(--luci-color-ink-secondary); font-size: var(--luci-type-small-size); line-height: var(--luci-type-small-line); font-weight: 400; }
.hint { margin: 0; color: var(--luci-color-ink-secondary); }
/* An error is a status message: tinted fill and the status colour, never colour alone (the words say it) */
.error { margin: 0; padding: var(--luci-space-8) var(--luci-space-12); border-radius: var(--luci-radius-md); background: var(--luci-color-danger-bg); color: var(--luci-color-danger); font-weight: 500; }
.row { display: flex; flex-wrap: wrap; gap: var(--luci-space-8); align-items: center; }
.file { font: var(--luci-type-code-weight) 12px/1.5 var(--luci-font-code); color: var(--luci-color-ink-secondary); word-break: break-all; }
label { display: inline-flex; gap: var(--luci-space-4); align-items: center; color: var(--luci-color-ink-secondary); }

/* Page overlays while picking: drawn over the host page, never part of it */
.pick-layer, .pixel-layer { position: fixed; inset: 0; z-index: 2147483640; cursor: crosshair; background: transparent; touch-action: none; }
/* Picking an element by touch takes taps, not drags: the page still scrolls and zooms under the finger */
.pick-layer { touch-action: pan-x pan-y pinch-zoom; }
.highlight { position: fixed; z-index: 2147483646; pointer-events: none; border: 2px solid var(--luci-color-pick); background: var(--luci-color-pick-fill); border-radius: 2px; }
.highlight.locked { border-width: 2px; border-style: solid; }
.highlight.blocked { border-color: var(--luci-color-pick-blocked); background: var(--luci-color-pick-blocked-fill); }
.pad { position: fixed; z-index: 2147483645; pointer-events: none; border-style: solid; border-color: var(--luci-color-pad-fill); }
.margin { position: fixed; z-index: 2147483645; pointer-events: none; border-style: solid; border-color: var(--luci-color-margin-fill); }
@media (prefers-reduced-motion: no-preference) { .highlight { transition: top 60ms, left 60ms, width 60ms, height 60ms; } }
/* The label and the pixel swatch read like tooltips: Charcoal fill, Muzzle White text */
.label, .swatch { position: fixed; z-index: 2147483647; pointer-events: none; padding: var(--luci-space-4) var(--luci-space-8); border-radius: var(--luci-radius-md);
  background: var(--luci-color-muzzle-900); color: var(--luci-color-muzzle-50); box-shadow: var(--luci-elevation-bar);
  font: var(--luci-type-code-weight) 12px/1.4 var(--luci-font-code); }
.label { max-width: 360px; white-space: pre-wrap; }
.label .reason { display: block; color: var(--luci-color-nose-pink-300); font-family: var(--luci-font-body); }
.swatch { display: flex; gap: var(--luci-space-8); align-items: center; }
.chip { width: 16px; height: 16px; border-radius: 4px; box-shadow: inset 0 0 0 1px var(--luci-color-bar-stroke); }
/* Pixel mode's loupe: the pixels around the pointer, 8 times larger, the picked one framed */
.loupe { position: fixed; z-index: 2147483647; pointer-events: none; width: 120px; height: 120px; border-radius: 50%; image-rendering: pixelated;
  background: var(--luci-color-muzzle-900); box-shadow: 0 0 0 3px var(--luci-color-muzzle-50), var(--luci-shadow-float); }

/* State pills */
.states-list { display: flex; flex-wrap: wrap; gap: var(--luci-space-4); }
.state { display: inline-flex; align-items: center; gap: var(--luci-space-4); height: 26px; padding: 0 var(--luci-space-12); border-radius: var(--luci-radius-full);
  background: var(--luci-color-surface-sunken); color: var(--luci-color-ink); font-size: var(--luci-type-small-size); font-weight: 500; }
.state.default { background: var(--luci-color-primary-soft); color: var(--luci-color-link); font-weight: 600; }
.state.missing { background: transparent; color: var(--luci-color-ink-secondary); border: 1px dashed var(--luci-color-stroke-strong); }
.manual-row { display: flex; align-items: center; justify-content: space-between; gap: var(--luci-space-12); }
.section-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.manual-actions { display: inline-flex; align-items: center; gap: var(--luci-space-8); flex: none; }

/* Settings and the 3-column export settings */
.settings-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--luci-space-8); }
.field-stack { display: flex; flex-direction: column; align-items: stretch; gap: var(--luci-space-4); color: var(--luci-color-ink); }
.field-label { font-size: var(--luci-type-small-size); line-height: var(--luci-type-small-line); font-weight: 600; color: var(--luci-color-ink); }
.field-stack .select, .field-stack select { width: 100%; }
.settings-appearance { display: flex; flex-direction: column; gap: var(--luci-space-12); }
/* The words wrap beside the control; the control keeps its place on the right */
.setting-row { display: flex; align-items: center; justify-content: space-between; gap: var(--luci-space-12); }
.setting-copy { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.setting-row > .seg { flex: none; align-self: center; }
.settings-divider { height: 1px; margin: var(--luci-space-4) 0; border: 0; background: var(--luci-color-stroke-subtle); }
.shortcut-list { display: grid; grid-template-columns: auto 1fr; gap: var(--luci-space-8) var(--luci-space-12); align-items: center; padding: var(--luci-space-12);
  border-radius: var(--luci-radius-md); background: var(--luci-color-surface-sunken); font-size: var(--luci-type-small-size); }
.kbd { display: inline-block; min-width: 24px; padding: 2px var(--luci-space-8); border-radius: 6px; background: var(--luci-color-surface-raised); color: var(--luci-color-ink);
  text-align: center; font: var(--luci-type-code-weight) 12px/1.4 var(--luci-font-code); }

/* Connected project status (v0.4.4) */
.project-card { display: flex; flex-direction: column; gap: var(--luci-space-8); padding: var(--luci-space-12); border-radius: var(--luci-radius-md); background: var(--luci-color-surface-sunken); }
.project-header { display: flex; align-items: flex-start; gap: var(--luci-space-8); }
.status-dot { flex: none; width: 8px; height: 8px; margin-top: 5px; border-radius: 50%; }
.status-dot.online { background: var(--luci-color-success); box-shadow: 0 0 0 2px var(--luci-color-success-bg); }
.status-dot.offline { background: var(--luci-color-stroke-strong); }
.project-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.project-name { font-weight: 600; color: var(--luci-color-ink); font-size: var(--luci-type-small-size); }
.project-path { font-size: 11px; color: var(--luci-color-ink-secondary); word-break: break-all; }
.project-hint { font-size: 11px; color: var(--luci-color-ink-secondary); }
.project-port-row { display: flex; align-items: center; gap: var(--luci-space-8); margin-top: var(--luci-space-4); }
.port-input { flex: 1; min-width: 0; padding: 4px var(--luci-space-8); border-radius: var(--luci-radius-sm); border: 1px solid var(--luci-color-stroke-subtle); background: var(--luci-color-surface-raised); font: var(--luci-type-code-weight) 12px/1.4 var(--luci-font-code); color: var(--luci-color-ink); }

/* DevTool tabbed settings (v0.4.4) */
.setting-tools-header { display: flex; flex-direction: column; gap: var(--luci-space-8); }
.tool-tabs { display: flex; width: 100%; box-sizing: border-box; }
.tool-tabs button { flex: 1 1 0; text-align: center; justify-content: center; }
.tool-settings-body { display: flex; flex-direction: column; gap: var(--luci-space-12); }
.swatches { display: flex; gap: var(--luci-space-8); flex-wrap: wrap; }
.luci-theme .swatches button { width: 28px; min-height: 28px; height: 28px; padding: 0; border-radius: 50%; border: 0; cursor: pointer; }
.luci-theme .swatches button::before { inset: -8px; }
.luci-theme .swatches button[aria-pressed="true"] { outline: 2px solid var(--luci-color-focus); outline-offset: 2px; }

/* The selected element and its tips */
.selected-card { display: flex; flex-direction: column; gap: var(--luci-space-12); padding: var(--luci-space-16); border-radius: var(--luci-radius-lg); background: var(--luci-color-surface-raised); border: 1px solid var(--luci-color-stroke-subtle); }
.selected-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--luci-space-8); flex-wrap: wrap; }
.selected-card h2 { margin: 0; font: var(--luci-type-heading-weight) var(--luci-type-heading-size)/var(--luci-type-heading-line) var(--luci-font-body); }
.tip-box { margin: 0; padding: var(--luci-space-8) var(--luci-space-12); border-radius: var(--luci-radius-md); background: var(--luci-color-surface-sunken); color: var(--luci-color-ink-secondary);
  font-size: var(--luci-type-small-size); line-height: var(--luci-type-small-line); }

/* The file and its actions */
.md-section { display: flex; flex-direction: column; gap: var(--luci-space-12); padding: var(--luci-space-16) var(--luci-space-20) var(--luci-space-20); background: var(--luci-color-surface-sunken); }
.md-head { display: flex; align-items: center; justify-content: space-between; gap: var(--luci-space-8); flex-wrap: wrap; }
.md-title { font: var(--luci-type-heading-weight) var(--luci-type-heading-size)/var(--luci-type-heading-line) var(--luci-font-body); color: var(--luci-color-ink); }
.file-row { display: flex; align-items: center; justify-content: space-between; gap: var(--luci-space-8); padding: var(--luci-space-8) var(--luci-space-12); border-radius: var(--luci-radius-md); background: var(--luci-color-surface-sunken); }
.scope-pill { flex: none; }
.actions { gap: var(--luci-space-8); }

/* Design check */
[data-part="check-summary"] { margin: 0; }
.row .rule { order: 1; flex-basis: 100%; max-height: 132px; overflow: auto; padding: var(--luci-space-8) var(--luci-space-12); border-radius: var(--luci-radius-md); background: var(--luci-color-surface-sunken); }
.rule code { font: var(--luci-type-code-weight) 12px/1.5 var(--luci-font-code); white-space: pre-wrap; word-break: break-word; }
.diffs { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--luci-space-4); overflow: auto; min-height: 60px; }
.diffs li { display: flex; flex-direction: column; gap: 2px; padding: var(--luci-space-8) var(--luci-space-12); border-radius: var(--luci-radius-md); background: var(--luci-color-surface-raised); border: 1px solid var(--luci-color-stroke-subtle); }
.diffs li.high { background: var(--luci-color-warning-bg); color: var(--luci-color-muzzle-900); border-color: transparent; }
.diffs li.high .dim { color: var(--luci-color-muzzle-700); }
.diffs label { align-items: flex-start; gap: var(--luci-space-8); color: inherit; }
.diffs input { flex: none; margin: 3px 0 0; }
.diffs .dim { padding-left: 21px; }

/* Screenshot diff overlay (v0.4.4) */
.diff-section { border-top: 1px solid var(--luci-color-stroke-subtle); padding-top: var(--luci-space-8); }
.diff-controls { display: flex; flex-direction: column; gap: var(--luci-space-8); padding: var(--luci-space-12); border-radius: var(--luci-radius-md); background: var(--luci-color-surface-sunken); }
.diff-slider { width: 100%; accent-color: var(--luci-color-primary); cursor: pointer; }
.diff-overlay { position: fixed; z-index: 2147483644; pointer-events: none; overflow: hidden; box-shadow: 0 0 0 2px var(--luci-color-primary), var(--luci-shadow-float); border-radius: var(--luci-radius-sm); }
.diff-overlay img { width: 100%; height: 100%; object-fit: fill; display: block; }
.diff-split-line { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--luci-color-primary); box-shadow: var(--luci-shadow-float); pointer-events: none; }

/* Loading */
.loading { display: flex; gap: var(--luci-space-12); align-items: center; margin: 0; color: var(--luci-color-ink); }
.loading .steps { color: var(--luci-color-ink-secondary); font-size: var(--luci-type-small-size); }
.loading-sleep { flex-direction: column; gap: var(--luci-space-8); padding: var(--luci-space-16) 0; text-align: center; }
.loading-sleep .stack { align-items: center; }
/* Spins with transform only: the browser keeps it moving off the page's main thread, even while Luci reads a heavy page */
.spinner { flex: none; width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--luci-color-stroke-strong); border-top-color: var(--luci-color-primary);
  animation: luci-spin 0.8s linear infinite; will-change: transform; }
button .spinner { display: inline-block; width: 12px; height: 12px; vertical-align: -2px; }
@keyframes luci-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
`;
