/** The Feedback layer's styles, on top of the capture toolbar's (same look, same shadow-root isolation). */
import { TOOLBAR_CSS } from '@luci/capture';

export const FEEDBACK_CSS = `${TOOLBAR_CSS}
.luci { --marker: #a78bfa; }
.conn { display: inline-flex; align-items: center; gap: 6px; padding: 0 8px; color: var(--muted); font-size: 12px; }
.conn::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; }
.conn.project::before { background: #4ade80; }
.marker { position: fixed; z-index: 2147483644; min-width: 24px; height: 24px; padding: 0 6px; transform: translate(-50%, -50%);
  display: inline-flex; align-items: center; justify-content: center; gap: 2px; border-radius: 999px; border: 2px solid var(--marker);
  background: var(--marker); color: #18181b; font: 600 11px/1 system-ui, sans-serif; cursor: pointer; box-shadow: 0 2px 8px rgb(0 0 0 / 0.35); }
.marker:hover { filter: brightness(1.1); background: var(--marker); }
.marker.sent { background: #18181b; color: var(--marker); }
.marker.acknowledged { background: #18181b; color: #60a5fa; border-color: #60a5fa; }
.marker.question { background: #f59e0b; border-color: #f59e0b; }
.marker.resolved { background: #4ade80; border-color: #4ade80; }
.marker.dismissed { background: #52525b; border-color: #52525b; color: #e4e4e7; }
.marker.lost { opacity: 0.6; border-style: dashed; }
.pop { position: fixed; z-index: 2147483647; width: min(340px, calc(100vw - 24px)); display: flex; flex-direction: column; gap: 8px; padding: 10px 12px;
  background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 40px rgb(0 0 0 / 0.45); }
.pop h3 { margin: 0; font-size: 13px; font-weight: 600; }
.pop textarea { font: 13px/1.4 system-ui, sans-serif; background: #27272a; min-height: 64px; }
.pop .quote { margin: 0; padding: 6px 8px; border-left: 2px solid var(--line); color: var(--muted); }
.thread { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.thread li { padding: 4px 8px; border-radius: 6px; background: #27272a; }
.thread li.agent { background: #3b2f63; }
.status { display: inline-block; padding: 1px 8px; border-radius: 999px; border: 1px solid var(--line); font-size: 12px; }
.status.question { border-color: #f59e0b; color: #fbbf24; }
.status.resolved { border-color: #4ade80; color: #86efac; }
.status.acknowledged { border-color: #60a5fa; color: #93c5fd; }
.status.dismissed { color: var(--muted); }
.chip-add { position: fixed; z-index: 2147483647; }
.swatches { display: flex; gap: 6px; }
.swatches button { width: 24px; height: 24px; padding: 0; border-radius: 50%; border: 2px solid transparent; }
.swatches button[aria-pressed="true"] { border-color: #f4f4f5; }
.split { display: inline-flex; }
.split > button:first-child { border-top-right-radius: 0; border-bottom-right-radius: 0; }
.split .caret { padding: 6px 6px; border-top-left-radius: 0; border-bottom-left-radius: 0; border-left: 1px solid var(--line); }
.menu { position: fixed; top: 56px; right: 12px; z-index: 2147483647; display: flex; flex-direction: column; gap: 2px; padding: 4px; min-width: 260px;
  background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 40px rgb(0 0 0 / 0.45); }
.menu button { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; padding: 8px 10px; }
.field { font: inherit; color: inherit; background: #27272a; border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px; }
.tabs { align-self: flex-start; }
.tabs button { padding: 4px 10px; }
.notes-scroll { overflow: auto; display: flex; flex-direction: column; gap: 10px; min-height: 0; }
.page-group h3 { display: flex; gap: 8px; align-items: baseline; margin: 0 0 6px; font-size: 12px; font-weight: 600; color: var(--ink); }
.page-group h3 code { font: 12px ui-monospace, monospace; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.page-group h3 .here { padding: 0 6px; border-radius: 999px; background: #27272a; color: var(--muted); font-weight: 400; }
.page-group h3 .count { margin-left: auto; color: var(--muted); font-weight: 400; }
.notes { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.notes li { border: 1px solid var(--line); border-radius: 8px; }
.notes li.expanded { border-color: var(--accent); }
.row-main { display: flex; gap: 10px; align-items: flex-start; width: 100%; padding: 8px 10px; text-align: left; border-radius: 8px; }
.row-main .body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.row-main .comment { overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.meta { color: var(--muted); font-size: 12px; margin: 0; }
.dot { flex: none; min-width: 22px; height: 22px; padding: 0 5px; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px;
  border: 2px solid var(--marker); background: var(--marker); color: #18181b; font: 600 11px/1 system-ui, sans-serif; }
.dot.sent { background: transparent; color: var(--marker); }
.dot.acknowledged { background: transparent; color: #60a5fa; border-color: #60a5fa; }
.dot.question { background: #f59e0b; border-color: #f59e0b; }
.dot.resolved { background: #4ade80; border-color: #4ade80; }
.dot.dismissed { background: #52525b; border-color: #52525b; color: #e4e4e7; }
.row-details { display: flex; flex-direction: column; gap: 8px; padding: 0 10px 10px 42px; }
.details h3 { display: flex; gap: 8px; align-items: center; }
.details .comment { margin: 0; }
.link, .link-button { color: var(--accent); align-self: flex-start; }
.link-button { padding: 0; text-decoration: underline; }
.link-button:hover { background: transparent; }
.row-details .details { gap: 6px; }
.footer { border-top: 1px solid var(--line); padding-top: 10px; }
.danger { border-top: 1px solid var(--line); padding-top: 10px; }
`;
