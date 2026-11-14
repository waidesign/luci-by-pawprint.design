/**
 * The Feedback and Layout layers' styles, on top of the capture toolbar's (same look, same
 * shadow-root isolation). Values come only from @luci/ui's tokens (var(--luci-*)).
 */
import { TOOLBAR_CSS } from '@luci/capture';

export const FEEDBACK_CSS = `${TOOLBAR_CSS}
.luci-theme { --marker: var(--luci-color-muzzle-900); --marker-ink: var(--luci-color-muzzle-50); }
/* Where notes are kept: the words say it, the dot repeats it */
.conn { display: inline-flex; align-items: center; gap: var(--luci-space-8); padding: 0 var(--luci-space-8); color: var(--luci-color-ink-secondary); font-size: var(--luci-type-small-size); }
.conn::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--luci-color-warning); }
.conn.project::before { background: var(--luci-color-success); }
.bar .conn { color: var(--luci-color-bar-ink-secondary); }
.bar .conn::before { background: var(--luci-color-iris-gold-300); }
.bar .conn.project::before { background: var(--luci-color-collar-lime-500); }
/* As a button ("connect"), the dot keeps its place instead of the touch-target layer */
.luci-theme button.conn { display: inline-flex; padding-block: 0; }
.luci-theme button.conn::before { position: static; inset: auto; }

/* Note markers on the page */
.marker { position: fixed; z-index: 2147483644; min-width: 24px; height: 24px; min-height: 24px; padding: 0 6px; transform: translate(-50%, -50%);
  display: inline-flex; align-items: center; justify-content: center; gap: 2px; border-radius: var(--luci-radius-full); border: 0;
  background: var(--marker); color: var(--marker-ink); font: 600 11px/1 var(--luci-font-body); cursor: pointer; box-shadow: var(--luci-shadow-float); }
.marker::before { inset: -10px; }
/* Placed with transform: the buttons' press nudge must not move markers or handles */
.luci-theme .marker, .luci-theme .marker:active { transform: translate(-50%, -50%); transition: background-color var(--luci-motion-fast); }
.luci-theme .handle:active, .luci-theme .ins:active { transform: none; }
.luci-theme .marker:hover { background: var(--marker); filter: brightness(1.08); }
/* Copied: Muzzle White with a ring in the marker's own colour, so it stays recognisable */
.luci-theme .marker.copied { background: var(--luci-color-muzzle-50); color: var(--luci-color-muzzle-900); box-shadow: inset 0 0 0 2px var(--marker), var(--luci-shadow-float); }
.luci-theme .marker.done { background: var(--luci-color-success-bg); color: var(--luci-color-success); }
.marker.lost { opacity: 0.6; }

/* The note popover */
.pop { position: fixed; z-index: 2147483647; width: min(360px, calc(100vw - 24px)); display: flex; flex-direction: column; gap: var(--luci-space-12); padding: var(--luci-space-16);
  background: var(--luci-color-surface); border-radius: var(--luci-radius-lg); box-shadow: var(--luci-shadow-float); }
.pop h3 { margin: 0; font: var(--luci-type-heading-weight) var(--luci-type-heading-size)/var(--luci-type-heading-line) var(--luci-font-body); }
.pop textarea { min-height: 72px; }
.pop .quote { margin: 0; padding: var(--luci-space-8) var(--luci-space-12); border-radius: var(--luci-radius-md); background: var(--luci-color-surface-sunken); color: var(--luci-color-ink-secondary); }
.thread { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--luci-space-4); }
.thread li { padding: var(--luci-space-8) var(--luci-space-12); border-radius: var(--luci-radius-md); background: var(--luci-color-surface-sunken); }
.thread li.agent { background: var(--luci-color-primary-soft); }
.status { display: inline-flex; align-items: center; height: 22px; padding: 0 var(--luci-space-8); border-radius: var(--luci-radius-full);
  background: var(--luci-color-surface-sunken); color: var(--luci-color-ink); font-size: var(--luci-type-micro-size); font-weight: var(--luci-type-micro-weight); }
.status.new { background: var(--luci-color-primary-soft); color: var(--luci-color-link); }
.status.done { background: var(--luci-color-success-bg); color: var(--luci-color-success); }
.chip-add { position: fixed; z-index: 2147483647; }
.swatches { display: flex; gap: var(--luci-space-8); }
.luci-theme .swatches button { width: 28px; min-height: 28px; height: 28px; padding: 0; border-radius: 50%; }
.luci-theme .swatches button::before { inset: -8px; }
.luci-theme .swatches button[aria-pressed="true"] { outline: 2px solid var(--luci-color-focus); outline-offset: 2px; }

/* Copy prompt and its menu */
.split { display: inline-flex; }
.split > button:first-child { border-top-right-radius: 0; border-bottom-right-radius: 0; padding-right: var(--luci-space-8); }
.luci-theme .split .caret { padding-inline: var(--luci-space-8) var(--luci-space-12); border-top-left-radius: 0; border-bottom-left-radius: 0; }
.menu { position: fixed; top: 64px; right: var(--luci-space-12); z-index: 2147483647; display: flex; flex-direction: column; gap: 2px; padding: var(--luci-space-8); min-width: 280px;
  background: var(--luci-color-surface-raised); border-radius: var(--luci-radius-md); box-shadow: var(--luci-shadow-float); }
.luci-theme[data-dock="left"] .menu { right: auto; left: var(--luci-space-12); }
.luci-theme .menu button { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px; min-height: 48px; padding: var(--luci-space-8) var(--luci-space-12);
  border-radius: var(--luci-radius-sm); text-align: left; white-space: normal; }
.field { min-height: var(--luci-btn-h); }
.tabs { align-self: flex-start; }

/* The notes list */
.notes-scroll { overflow: auto; display: flex; flex-direction: column; gap: var(--luci-space-12); min-height: 0; }
.page-group h3 { display: flex; gap: var(--luci-space-8); align-items: baseline; margin: 0 0 var(--luci-space-8); font-size: var(--luci-type-small-size); font-weight: 600; color: var(--luci-color-ink); }
.page-group h3 code { font: var(--luci-type-code-weight) 12px var(--luci-font-code); color: var(--luci-color-ink-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.page-group h3 .here { padding: 0 var(--luci-space-8); border-radius: var(--luci-radius-full); background: var(--luci-color-primary-soft); color: var(--luci-color-link); font-weight: 600; }
.page-group h3 .count { margin-left: auto; min-width: 0; height: auto; padding: 0; background: none; color: var(--luci-color-ink-secondary); font-weight: 400; }
.notes { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--luci-space-4); }
.notes li { border: 1px solid var(--luci-color-stroke-subtle); border-radius: var(--luci-radius-lg); background: var(--luci-color-surface-raised); }
.notes li.expanded { border-color: var(--luci-color-stroke-strong); }
.luci-theme .row-main { display: flex; justify-content: flex-start; align-items: flex-start; gap: var(--luci-space-12); width: 100%; min-height: 48px; padding: var(--luci-space-12);
  border-radius: var(--luci-radius-lg); text-align: left; white-space: normal; font-weight: 400; }
.row-main .body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.row-main .comment { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.meta { margin: 0; color: var(--luci-color-ink-secondary); font-size: var(--luci-type-small-size); }
.dot { flex: none; min-width: 22px; height: 22px; padding: 0 5px; display: inline-flex; align-items: center; justify-content: center; border-radius: var(--luci-radius-full);
  background: var(--marker); color: var(--marker-ink); font: 600 11px/1 var(--luci-font-body); }
.dot.copied { background: var(--luci-color-surface-sunken); color: var(--luci-color-ink); }
.dot.done { background: var(--luci-color-success-bg); color: var(--luci-color-success); }
.row-details { display: flex; flex-direction: column; gap: var(--luci-space-8); padding: 0 var(--luci-space-12) var(--luci-space-12) 46px; }
.details h3 { display: flex; gap: var(--luci-space-8); align-items: center; }
.details .comment { margin: 0; }
.row-details .details { gap: var(--luci-space-8); }
.link, .luci-theme .link-button { color: var(--luci-color-link); align-self: flex-start; }
.luci-theme .link-button { min-height: 0; padding: 0; text-decoration: underline; font-weight: 500; }
.luci-theme .link-button:hover { background: transparent; }
.footer, .danger, .plan-footer { padding-top: var(--luci-space-12); border-top: 1px solid var(--luci-color-stroke-subtle); }

/* Layout mode: overlays on the page */
.sel { position: fixed; z-index: 2147483643; pointer-events: none; border: 2px solid var(--luci-color-pick); }
.luci-theme .handle { position: fixed; z-index: 2147483646; display: block; min-height: 0; padding: 0; background: var(--luci-color-pick); border: 2px solid var(--luci-color-muzzle-50);
  border-radius: 4px; box-shadow: var(--luci-shadow-float); touch-action: none; }
.luci-theme .handle::before { inset: -6px; }
.luci-theme .handle:hover { background: var(--luci-color-primary-hover); }
.h-side, .h-corner { padding: 0; }
.boxmodel { position: fixed; z-index: 2147483642; pointer-events: none; }
.boxmodel.margin { background: var(--luci-color-margin-fill); }
.boxmodel.pad { background: var(--luci-color-pad-fill); }
.luci-theme .handle.h-move { display: inline-flex; align-items: center; justify-content: center; width: 28px; min-height: 28px; height: 28px; padding: 0; color: var(--luci-color-on-primary); font: 600 14px/1 var(--luci-font-body); cursor: grab; }
.drop-line { position: fixed; z-index: 2147483646; pointer-events: none; background: var(--luci-color-insert); border-radius: 2px; }
.ins { position: fixed; z-index: 2147483641; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--luci-space-4);
  padding: var(--luci-space-4); overflow: hidden; border: 2px dashed var(--luci-color-insert); border-radius: var(--luci-radius-sm); background: var(--luci-color-insert-fill); cursor: pointer; text-align: center; }
.ins[aria-selected="true"] { border-style: solid; }
.ins-name, .ins-label { max-width: 100%; padding: 2px var(--luci-space-8); border-radius: 6px; background: var(--luci-color-muzzle-900); color: var(--luci-color-insert-ink);
  font: 600 12px/1.3 var(--luci-font-body); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ins-label { font-weight: 400; color: var(--luci-color-muzzle-50); }
.highlight.inside { border-style: dashed; border-color: var(--luci-color-insert); background: var(--luci-color-insert-fill); }

/* Layout mode: the panel */
.layout-panel { max-height: min(80vh, 680px); overflow: auto; }
.layout-panel details { display: flex; flex-direction: column; gap: var(--luci-space-8); padding-top: var(--luci-space-12); border-top: 1px solid var(--luci-color-stroke-subtle); }
.layout-panel summary { cursor: pointer; font-weight: 600; margin-bottom: var(--luci-space-4); }
.layout-panel details > * + * { margin-top: var(--luci-space-8); }
.layout-panel select { min-width: 140px; }
.layout-panel textarea { min-height: 56px; }
.sides { display: flex; flex-direction: column; gap: var(--luci-space-4); }
.sides-head { display: flex; justify-content: space-between; align-items: center; }
.luci-theme .link-toggle { padding-inline: var(--luci-space-8); font-size: var(--luci-type-small-size); color: var(--luci-color-ink-secondary); }
.sides-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--luci-space-4) var(--luci-space-12); }
.side-cell { display: grid; grid-template-columns: 44px 1fr; align-items: center; gap: var(--luci-space-4); color: var(--luci-color-ink); }
.side { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 2px; align-items: center; }
.luci-theme .side button, .luci-theme .lrow button { padding-inline: var(--luci-space-8); }
.side input { width: 100%; }
.lrow { display: grid; grid-template-columns: 96px auto 84px auto 1fr; gap: var(--luci-space-8); align-items: center; color: var(--luci-color-ink); }
.lrow:has(select) { grid-template-columns: 96px 1fr; }
.lrow .token { font: var(--luci-type-code-weight) 12px var(--luci-font-code); }
.cat-group { display: flex; flex-direction: column; gap: var(--luci-space-8); padding-top: var(--luci-space-12); border-top: 1px solid var(--luci-color-stroke-subtle); }
.cat-group h3 { margin: 0; font-size: var(--luci-type-small-size); font-weight: 600; }
.cat-list { display: flex; flex-wrap: wrap; gap: var(--luci-space-4); }
.why { margin: 0; padding: var(--luci-space-12) var(--luci-space-16); border-radius: var(--luci-radius-lg); background: var(--luci-color-info-bg); color: var(--luci-color-muzzle-900); }

/* Layout mode, new page sketch: a full-window canvas over the app, below the bar and the panel */
.wf { position: fixed; inset: 0; z-index: 2147483641; overflow: auto; background: var(--luci-color-muzzle-100); color: var(--luci-color-muzzle-900);
  font: 400 var(--luci-type-small-size)/var(--luci-type-small-line) var(--luci-font-body); }
.wf-tools { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: var(--luci-space-8); align-items: center; padding: 72px var(--luci-space-24) var(--luci-space-12);
  background: var(--luci-color-surface); color: var(--luci-color-ink); border-bottom: 1px solid var(--luci-color-stroke-subtle); }
.wf-tools .dim { flex: 1 1 240px; }
.wf-route { display: inline-flex; gap: var(--luci-space-8); align-items: center; font-weight: 600; }
.wf-route .field { width: 200px; font: var(--luci-type-code-weight) 13px var(--luci-font-code); }
.wf-page { display: flex; flex-direction: column; gap: var(--luci-space-12); padding: var(--luci-space-20) var(--luci-space-24) 120px 44px; }
@media (min-width: 1000px) { .wf-page { margin-right: min(500px, 45vw); } }
.wf-row { position: relative; box-sizing: border-box; display: flex; align-items: stretch; min-height: 48px; padding: var(--luci-space-8); background: var(--luci-color-muzzle-50);
  border: 1px solid var(--luci-color-muzzle-200); border-radius: var(--luci-radius-md); }
.wf-row-num { position: absolute; left: -26px; top: var(--luci-space-8); color: var(--luci-color-muzzle-600); font: 600 12px var(--luci-font-body); }
.wf-block { flex-basis: 0; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--luci-space-4); padding: var(--luci-space-4); overflow: hidden;
  border: 2px dashed var(--luci-color-muzzle-400); border-radius: var(--luci-radius-sm); background: var(--luci-color-muzzle-0); cursor: pointer; text-align: center; }
.wf-block:hover { border-color: var(--luci-color-muzzle-600); }
.wf-block[aria-selected="true"] { border: 2px solid var(--luci-color-muzzle-600); background: var(--luci-color-ginger-50); }
.wf-block:focus-visible { outline: 2px solid var(--luci-color-muzzle-900); outline-offset: 2px; }
.wf-share { color: var(--luci-color-muzzle-600); font: 11px var(--luci-font-code); }
.wf-divider { flex: none; width: 10px; cursor: ew-resize; border-radius: 4px; touch-action: none; }
.wf-divider:hover { background: var(--luci-color-muzzle-200); }
.wf-row-handle { position: absolute; left: 50%; bottom: -7px; width: 44px; height: 12px; margin-left: -22px; box-sizing: border-box; background: var(--luci-color-pick);
  border: 2px solid var(--luci-color-muzzle-50); border-radius: 4px; cursor: ns-resize; touch-action: none; }
`;
