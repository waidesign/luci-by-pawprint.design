/**
 * The toolbar's styles. They live in its shadow root, so the page and the toolbar never affect each
 * other. Built on @luci/ui (tokens, base and components from the brand kit): this file only lays out
 * the toolbar's own parts, with var(--luci-*) values and no colours of its own.
 */
import { UI_CSS } from '@luci/ui';

export const TOOLBAR_CSS = `
:host { all: initial; }
${UI_CSS}
/* Compact, as the kit gives for the toolbar panel: 32 px buttons, small labels, small body text */
.luci-theme { --luci-btn-h: 32px; --luci-btn-font: var(--luci-type-small-size); --luci-btn-line: var(--luci-type-small-line); --luci-btn-pad: var(--luci-space-12);
  font-size: var(--luci-type-small-size); line-height: var(--luci-type-small-line); }

/* The floating card: header, tools, then the active panel (DESIGN.md: radius-xl, float shadow, no stroke) */
.shell {
  position: fixed;
  top: var(--luci-space-12);
  right: var(--luci-space-12);
  z-index: 2147483647;
  width: min(560px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  display: flex;
  flex-direction: column;
  background: var(--luci-color-surface);
  border-radius: var(--luci-radius-xl);
  box-shadow: var(--luci-shadow-float);
  overflow: hidden;
}
.luci-theme[data-dock="left"] .shell,
.luci-theme[data-dock="left"] .bar,
.luci-theme[data-dock="left"] .sub,
.luci-theme[data-dock="left"] .panel {
  right: auto;
  left: var(--luci-space-12);
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--luci-space-12);
  padding: var(--luci-space-16) var(--luci-space-16) var(--luci-space-8) var(--luci-space-20);
  flex-shrink: 0;
}
.header.compact { align-items: center; padding: var(--luci-space-8) var(--luci-space-8) var(--luci-space-4) var(--luci-space-12); }
.brand-row { display: flex; align-items: flex-start; gap: var(--luci-space-12); min-width: 0; flex: 1; }
.header.compact .brand-row { align-items: center; gap: var(--luci-space-8); }
.brand-stack { display: flex; flex-direction: column; gap: var(--luci-space-4); min-width: 0; }
.brand-title-line { display: flex; align-items: baseline; gap: var(--luci-space-8); flex-wrap: wrap; }
.brand-title { font: var(--luci-type-title-weight) var(--luci-type-title-size)/var(--luci-type-title-line) var(--luci-font-display); color: var(--luci-color-ink); }
.brand-sub { font-size: var(--luci-type-small-size); line-height: var(--luci-type-small-line); font-weight: var(--luci-type-small-weight); color: var(--luci-color-ink-secondary); }
.brand-desc { font-size: var(--luci-type-small-size); line-height: var(--luci-type-small-line); color: var(--luci-color-ink-secondary); }
.header-actions { display: flex; align-items: center; gap: var(--luci-space-4); flex: none; }
.btn-icon { color: var(--luci-color-ink-secondary); font-size: 18px; }
.btn-icon:hover, .btn-icon[aria-pressed="true"] { color: var(--luci-color-ink); }

/* The tools row (and, on their own, the Feedback and Layout bars) */
.bar {
  position: fixed;
  top: var(--luci-space-12);
  right: var(--luci-space-12);
  z-index: 2147483647;
  display: flex;
  flex-wrap: wrap;
  gap: var(--luci-space-4);
  align-items: center;
  max-width: calc(100vw - 24px);
  padding: var(--luci-space-8);
  background: var(--luci-color-surface);
  border-radius: var(--luci-radius-xl);
  box-shadow: var(--luci-shadow-float);
}
.shell > .bar { position: static; max-width: none; padding: var(--luci-space-4) var(--luci-space-12) var(--luci-space-12); border-radius: 0; box-shadow: none; flex-shrink: 0; }
.bar > button { padding-inline: var(--luci-space-8); }
.shell > .bar { gap: 2px; }
.brand { display: inline-flex; align-items: center; gap: var(--luci-space-8); padding: 0 var(--luci-space-8) 0 var(--luci-space-4);
  font: var(--luci-type-display-weight) var(--luci-type-heading-size)/1 var(--luci-font-display); }

/* The hint under the tools while picking */
.sub {
  position: fixed;
  top: 72px;
  right: var(--luci-space-12);
  z-index: 2147483647;
  width: min(400px, calc(100vw - 24px));
  display: flex;
  flex-direction: column;
  gap: var(--luci-space-8);
  padding: var(--luci-space-12) var(--luci-space-16);
  background: var(--luci-color-surface);
  border-radius: var(--luci-radius-lg);
  box-shadow: var(--luci-shadow-float);
}
.shell > .sub { position: static; width: auto; margin: 0 var(--luci-space-12) var(--luci-space-12); background: var(--luci-color-surface-sunken); box-shadow: none; flex-shrink: 0; }
.sub p { margin: 0; }
.keys { color: var(--luci-color-ink-secondary); font-size: var(--luci-type-small-size); line-height: var(--luci-type-small-line); }

/* Segmented control */
.seg { display: inline-flex; align-self: flex-start; gap: var(--luci-space-4); padding: var(--luci-space-4); background: var(--luci-color-surface-sunken); border-radius: var(--luci-radius-full); }
.luci-theme .seg button { min-height: 28px; padding: 5px var(--luci-space-12); }
.seg button::before { inset: -8px 0; }
.luci-theme .seg button[aria-pressed="true"] { background: var(--luci-color-surface-raised); color: var(--luci-color-ink); }

/* Lists: basket items, section files */
.items { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--luci-space-8); overflow: auto; }
.items li { display: grid; grid-template-columns: 1fr auto; gap: var(--luci-space-8); align-items: center; padding: var(--luci-space-12);
  background: var(--luci-color-surface-raised); border: 1px solid var(--luci-color-stroke-subtle); border-radius: var(--luci-radius-lg); }
.files { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--luci-space-4); }
.files li { display: flex; gap: var(--luci-space-8); align-items: center; justify-content: space-between; padding: var(--luci-space-4) var(--luci-space-4) var(--luci-space-4) var(--luci-space-12);
  background: var(--luci-color-surface-raised); border: 1px solid var(--luci-color-stroke-subtle); border-radius: var(--luci-radius-md); }
.files li > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.files code, [data-part="file-view-box"] code { font: var(--luci-type-code-weight) 12px/1.5 var(--luci-font-code); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.items textarea { grid-column: 1 / -1; min-height: 40px; resize: vertical; font-size: var(--luci-type-small-size); line-height: var(--luci-type-small-line); }
.items input { min-width: 0; }
.items .meta { grid-column: 1; color: var(--luci-color-ink-secondary); font-size: var(--luci-type-small-size); }
.items .row { grid-column: 2; grid-row: 1 / span 2; }
.stack { display: flex; flex-direction: column; align-items: stretch; gap: var(--luci-space-8); }

/* Text areas: the file preview is code on the sunken surface */
textarea { resize: vertical; }
textarea.preview { min-height: 180px; flex: 1; padding: var(--luci-space-12); white-space: pre; overflow: auto; background: var(--luci-color-surface-raised);
  font: var(--luci-type-code-weight) var(--luci-type-code-size)/var(--luci-type-code-line) var(--luci-font-code); }
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
.highlight { position: fixed; z-index: 2147483646; pointer-events: none; border: 2px solid var(--luci-color-pick); background: var(--luci-color-pick-fill); border-radius: 2px; }
.highlight.locked { border-width: 2px; border-style: solid; }
.highlight.blocked { border-color: var(--luci-color-pick-blocked); background: var(--luci-color-pick-blocked-fill); }
.pad { position: fixed; z-index: 2147483645; pointer-events: none; border-style: solid; border-color: var(--luci-color-pad-fill); }
.margin { position: fixed; z-index: 2147483645; pointer-events: none; border-style: solid; border-color: var(--luci-color-margin-fill); }
@media (prefers-reduced-motion: no-preference) { .highlight { transition: top 60ms, left 60ms, width 60ms, height 60ms; } }
/* The label and the pixel swatch read like tooltips: Charcoal fill, Muzzle White text */
.label, .swatch { position: fixed; z-index: 2147483647; pointer-events: none; padding: var(--luci-space-4) var(--luci-space-8); border-radius: var(--luci-radius-md);
  background: var(--luci-color-muzzle-900); color: var(--luci-color-muzzle-50); box-shadow: var(--luci-shadow-float);
  font: var(--luci-type-code-weight) 12px/1.4 var(--luci-font-code); }
.label { max-width: 360px; white-space: pre-wrap; }
.label .reason { display: block; color: var(--luci-color-nose-pink-300); font-family: var(--luci-font-body); }
.swatch { display: flex; gap: var(--luci-space-8); align-items: center; }
.chip { width: 16px; height: 16px; border-radius: 4px; box-shadow: inset 0 0 0 1px var(--luci-color-bar-stroke); }

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
.field-stack select { width: 100%; }
.settings-appearance { display: flex; flex-direction: column; gap: var(--luci-space-12); }
.setting-row { display: flex; align-items: center; justify-content: space-between; gap: var(--luci-space-12); flex-wrap: wrap; }
.setting-copy { display: flex; flex-direction: column; gap: 2px; }
.settings-divider { height: 1px; margin: var(--luci-space-4) 0; border: 0; background: var(--luci-color-stroke-subtle); }
.shortcut-list { display: grid; grid-template-columns: auto 1fr; gap: var(--luci-space-8) var(--luci-space-12); align-items: center; padding: var(--luci-space-12);
  border-radius: var(--luci-radius-md); background: var(--luci-color-surface-sunken); font-size: var(--luci-type-small-size); }
.kbd { display: inline-block; min-width: 24px; padding: 2px var(--luci-space-8); border-radius: 6px; background: var(--luci-color-surface-raised); color: var(--luci-color-ink);
  text-align: center; font: var(--luci-type-code-weight) 12px/1.4 var(--luci-font-code); }

/* The selected element and its tips */
.selected-card { display: flex; flex-direction: column; gap: var(--luci-space-12); padding: var(--luci-space-16); border-radius: var(--luci-radius-lg); background: var(--luci-color-surface-raised); border: 1px solid var(--luci-color-stroke-subtle); }
.selected-head { display: flex; align-items: baseline; justify-content: space-between; gap: var(--luci-space-8); flex-wrap: wrap; }
.selected-card h2 { margin: 0; font: var(--luci-type-heading-weight) var(--luci-type-heading-size)/var(--luci-type-heading-line) var(--luci-font-body); }
.tip-box { margin: 0; padding: var(--luci-space-8) var(--luci-space-12); border-radius: var(--luci-radius-md); background: var(--luci-color-surface-sunken); color: var(--luci-color-ink-secondary);
  font-size: var(--luci-type-small-size); line-height: var(--luci-type-small-line); }

/* Panels */
.panel {
  position: fixed;
  right: var(--luci-space-12);
  bottom: var(--luci-space-12);
  z-index: 2147483647;
  width: min(480px, calc(100vw - 24px));
  max-height: min(72vh, 660px);
  display: flex;
  flex-direction: column;
  gap: var(--luci-space-12);
  padding: var(--luci-space-16) var(--luci-space-20);
  background: var(--luci-color-surface);
  border-radius: var(--luci-radius-xl);
  box-shadow: var(--luci-shadow-float);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.shell > .panel { position: static; width: auto; max-height: none; flex: 1 1 auto; min-height: 0; border-radius: 0; box-shadow: none; padding-top: var(--luci-space-4); }
.panel > * { flex-shrink: 0; }
.panel > .items, .panel > .diffs { flex-shrink: 1; }
.panel h2 { margin: 0; font: var(--luci-type-title-weight) var(--luci-type-title-size)/var(--luci-type-title-line) var(--luci-font-display); }
.panel.result-panel { padding: 0; gap: 0; }
.panel-body { display: flex; flex-direction: column; gap: var(--luci-space-12); padding: var(--luci-space-4) var(--luci-space-20) var(--luci-space-16); }
.md-section { display: flex; flex-direction: column; gap: var(--luci-space-12); padding: var(--luci-space-16) var(--luci-space-20) var(--luci-space-20); background: var(--luci-color-surface-sunken); }
.md-head { display: flex; align-items: center; justify-content: space-between; gap: var(--luci-space-8); flex-wrap: wrap; }
.md-title { font: var(--luci-type-heading-weight) var(--luci-type-heading-size)/var(--luci-type-heading-line) var(--luci-font-body); color: var(--luci-color-ink); }
.file-row { display: flex; align-items: center; justify-content: space-between; gap: var(--luci-space-8); padding: var(--luci-space-8) var(--luci-space-12); border-radius: var(--luci-radius-md); background: var(--luci-color-surface-sunken); }
.scope-pill { flex: none; }

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

/* The dev toolbar's mode switch */
.modes { margin-right: var(--luci-space-4); }

/* Loading */
.loading { display: flex; gap: var(--luci-space-12); align-items: center; margin: 0; color: var(--luci-color-ink); }
.loading .steps { color: var(--luci-color-ink-secondary); font-size: var(--luci-type-small-size); }
.loading-sleep { display: flex; flex-direction: column; align-items: center; gap: var(--luci-space-8); padding: var(--luci-space-16) 0; text-align: center; }
/* Spins with transform only: the browser keeps it moving off the page's main thread, even while Luci reads a heavy page */
.spinner { flex: none; width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--luci-color-stroke-strong); border-top-color: var(--luci-color-primary);
  animation: luci-spin 0.8s linear infinite; will-change: transform; }
button .spinner { display: inline-block; width: 12px; height: 12px; vertical-align: -2px; }
@keyframes luci-spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation: none; } }
`;
