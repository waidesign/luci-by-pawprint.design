/** The Feedback layer's styles, on top of the capture toolbar's (same look, same shadow-root isolation). */
import { TOOLBAR_CSS } from '@luci/capture';

export const FEEDBACK_CSS = `${TOOLBAR_CSS}
.luci { --marker: #2b2b2b; }
.conn { display: inline-flex; align-items: center; gap: 6px; padding: 0 8px; color: var(--muted); font-size: 12px; }
.conn::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; }
.conn.project::before { background: #4ade80; }
.marker { position: fixed; z-index: 2147483644; min-width: 24px; height: 24px; padding: 0 6px; transform: translate(-50%, -50%);
  display: inline-flex; align-items: center; justify-content: center; gap: 2px; border-radius: 999px; border: 2px solid var(--marker);
  background: var(--marker); color: #f5efea; font: 600 11px/1 system-ui, sans-serif; cursor: pointer; box-shadow: 0 2px 8px rgb(18 18 21 / 0.35); }
.marker:hover { filter: brightness(1.1); background: var(--marker); }
.marker.copied { background: #f5efea; color: var(--marker); }
.marker.done { background: #4ade80; border-color: #4ade80; }
.marker.lost { opacity: 0.6; border-style: dashed; }
.pop { position: fixed; z-index: 2147483647; width: min(340px, calc(100vw - 24px)); display: flex; flex-direction: column; gap: 8px; padding: 10px 12px;
  background: var(--bg); border: 1px solid var(--line-strong); border-radius: 10px; box-shadow: var(--shadow); }
.pop h3 { margin: 0; font-size: 13px; font-weight: 600; }
.pop textarea { font: 13px/1.4 system-ui, sans-serif; background: var(--bg-field); min-height: 64px; }
.pop .quote { margin: 0; padding: 6px 8px; border-left: 2px solid var(--line-strong); color: var(--muted); }
.thread { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.thread li { padding: 4px 8px; border-radius: 6px; background: var(--bg-field); }
.thread li.agent { background: var(--active-bg); }
.status { display: inline-block; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line-strong); font-size: 12px; }
.status.new { border-color: var(--marker); }
.status.done { border-color: #4ade80; color: #22c55e; }
.chip-add { position: fixed; z-index: 2147483647; }
.swatches { display: flex; gap: 6px; }
.swatches button { width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 2px solid transparent; }
.swatches button[aria-pressed="true"] { border-color: var(--ink); }
.split { display: inline-flex; }
.split > button:first-child { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.split .caret { padding: 6px 6px; border-top-left-radius: 0; border-bottom-left-radius: 0; border-left: 1px solid var(--line-strong); }
.menu { position: fixed; top: 56px; right: 12px; z-index: 2147483647; display: flex; flex-direction: column; gap: 2px; padding: 4px; min-width: 260px;
  background: var(--bg); border: 1px solid var(--line-strong); border-radius: 10px; box-shadow: var(--shadow); }
.luci[data-dock="left"] .menu { right: auto; left: 12px; }
.menu button { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; padding: 8px 10px; }
.field { font: inherit; color: inherit; background: var(--bg-field); border: 1px solid var(--line-strong); border-radius: 6px; padding: 4px 6px; }
.tabs { align-self: flex-start; }
.tabs button { padding: 4px 10px; }
.notes-scroll { overflow: auto; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.page-group h3 { display: flex; gap: 8px; align-items: baseline; margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--ink); }
.page-group h3 code { font: 12px ui-monospace, monospace; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.page-group h3 .here { padding: 0 6px; border-radius: 999px; background: var(--bg-field); color: var(--muted); font-weight: 400; }
.page-group h3 .count { margin-left: auto; color: var(--muted); font-weight: 400; }
.notes { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.notes li { border: 1px solid var(--line-strong); border-radius: 8px; background: var(--bg-elevated); }
.notes li.expanded { border-color: var(--accent); }
.row-main { display: flex; gap: 10px; align-items: flex-start; width: 100%; padding: 8px 10px; text-align: left; border-radius: 8px; }
.row-main .body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.row-main .comment { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.meta { color: var(--muted); font-size: 12px; margin: 0; }
.dot { flex: none; min-width: 22px; height: 22px; padding: 0 5px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px;
  border: 2px solid var(--marker); background: var(--marker); color: #f5efea; font: 600 11px/1 system-ui, sans-serif; }
.dot.copied { background: transparent; color: var(--marker); }
.dot.done { background: #4ade80; border-color: #4ade80; }
.row-details { display: flex; flex-direction: column; gap: 8px; padding: 0 10px 10px 42px; }
.details h3 { display: flex; gap: 8px; align-items: center; }
.details .comment { margin: 0; }
.link, .link-button { color: var(--accent); align-self: flex-start; }
.link-button { padding: 0; text-decoration: underline; }
.link-button:hover { background: transparent; }
.row-details .details { gap: 6px; }
/* Layout mode */
.sel { position: fixed; z-index: 2147483643; pointer-events: none; border: 2px solid var(--accent); box-shadow: 0 0 0 1px rgb(24 24 27 / 0.6); }
.handle { position: fixed; z-index: 2147483646; display: block; background: var(--accent); border: 2px solid #18181b; border-radius: 4px; touch-action: none; }
.h-side, .h-corner { padding: 0; }
.boxmodel { position: fixed; z-index: 2147483642; pointer-events: none; }
.boxmodel.margin { background: rgb(251 146 60 / 0.25); }
.boxmodel.pad { background: rgb(74 222 128 / 0.22); }
.layout-panel details { border-top: 1px solid var(--line); padding-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.layout-panel summary { cursor: pointer; font-weight: 600; margin-bottom: 4px; }
.layout-panel details > * + * { margin-top: 6px; }
.layout-panel select { min-width: 140px; }
.sides { display: flex; flex-direction: column; gap: 4px; }
.sides-head { display: flex; justify-content: space-between; align-items: center; }
.link-toggle { padding: 2px 8px; font-size: 12px; color: var(--muted); }
.sides-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 10px; }
.side-cell { display: grid; grid-template-columns: 44px 1fr; align-items: center; gap: 4px; color: var(--ink); }
.side { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 2px; align-items: center; }
.side button { padding: 2px 6px; }
.side input { width: 100%; }
.plan-footer { border-top: 1px solid var(--line); padding-top: 10px; }
.h-move { width: 26px; height: 26px; padding: 0; display: inline-flex; align-items: center; justify-content: center; color: var(--accent-ink); font: 600 14px/1 system-ui; cursor: grab; }
.h-move:hover { background: var(--accent-hover); }
.drop-line { position: fixed; z-index: 2147483646; pointer-events: none; background: #f472b6; border-radius: 2px; box-shadow: 0 0 0 2px rgb(244 114 182 / 0.3); }
.lrow { display: grid; grid-template-columns: 96px auto 84px auto 1fr; gap: 6px; align-items: center; color: var(--ink); }
.lrow:has(select) { grid-template-columns: 96px 1fr; }
.lrow button { padding: 2px 8px; }
.lrow .token { font: 12px ui-monospace, monospace; }
.layout-panel { max-height: min(80vh, 680px); overflow: auto; }
.layout-panel textarea { font: 13px/1.4 system-ui, sans-serif; background: var(--bg-field); min-height: 56px; }
/* Layout mode, new parts: placeholders Luci draws (never in the page's DOM) */
.ins { position: fixed; z-index: 2147483641; box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  padding: 4px; overflow: hidden; border: 2px dashed #f472b6; border-radius: 6px; background: rgb(244 114 182 / 0.14); cursor: pointer; text-align: center; }
.ins[aria-selected="true"] { border-style: solid; background: rgb(244 114 182 / 0.22); }
.ins:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ins-name, .ins-label { max-width: 100%; padding: 2px 6px; border-radius: 4px; background: #18181b; color: #fbcfe8; font: 600 12px/1.3 system-ui, sans-serif;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ins-label { font-weight: 400; color: #f4f4f5; }
.highlight.inside { border-style: dashed; border-color: #f472b6; background: rgb(244 114 182 / 0.08); }
.cat-group { display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--line); padding-top: 8px; }
.cat-group h3 { margin: 0; font-size: 12px; font-weight: 600; }
.cat-list { display: flex; flex-wrap: wrap; gap: 4px; }
.cat-list button { padding: 4px 10px; }
/* Layout mode, new page sketch: a full-window canvas over the app, below the bar and the panel */
.wf { position: fixed; inset: 0; z-index: 2147483641; overflow: auto; background: #e4e4e7; color: #18181b; font: 13px/1.4 system-ui, sans-serif; }
.wf-tools { position: sticky; top: 0; z-index: 1; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 64px 24px 10px;
  background: var(--bg); color: var(--ink); border-bottom: 1px solid var(--line); }
.wf-tools .dim { flex: 1 1 240px; }
.wf-route { display: inline-flex; gap: 6px; align-items: center; font-weight: 600; }
.wf-route .field { width: 200px; font: 13px ui-monospace, monospace; }
.wf-page { display: flex; flex-direction: column; gap: 10px; padding: 20px 24px 120px 44px; }
@media (min-width: 1000px) { .wf-page { margin-right: min(484px, 45vw); } }
.wf-row { position: relative; box-sizing: border-box; display: flex; align-items: stretch; min-height: 48px; padding: 6px; background: #f5efea; border: 1px solid #cbbeb0; border-radius: 8px; }
.wf-row-num { position: absolute; left: -26px; top: 6px; color: #6e675f; font: 600 12px system-ui, sans-serif; }
.wf-block { flex-basis: 0; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 4px; overflow: hidden;
  border: 2px dashed #a39d96; border-radius: 6px; background: #faf6f2; cursor: pointer; text-align: center; }
.wf-block:hover { border-color: #6e675f; }
.wf-block[aria-selected="true"] { border: 2px solid #2b2b2b; background: rgb(43 43 43 / 0.1); }
.wf-block:focus-visible { outline: 2px solid #2b2b2b; outline-offset: 2px; }
.wf-share { color: #6e675f; font: 11px ui-monospace, monospace; }
.wf-divider { flex: none; width: 10px; cursor: ew-resize; border-radius: 4px; touch-action: none; }
.wf-divider:hover { background: rgb(43 43 43 / 0.25); }
.wf-row-handle { position: absolute; left: 50%; bottom: -7px; width: 44px; height: 12px; margin-left: -22px; box-sizing: border-box; background: var(--accent);
  border: 2px solid #18181b; border-radius: 4px; cursor: ns-resize; touch-action: none; }
.why { margin: 0; padding: 8px 10px; border-left: 3px solid var(--accent); border-radius: 4px; background: var(--bg-field); color: var(--ink); }
.footer { border-top: 1px solid var(--line); padding-top: 10px; }
.danger { border-top: 1px solid var(--line); padding-top: 10px; }
`;
