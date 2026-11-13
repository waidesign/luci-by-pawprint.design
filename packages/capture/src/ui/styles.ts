/** The toolbar's styles. They live in its shadow root, so the page and the toolbar never affect each other. */
export const TOOLBAR_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.luci { --ink: #f4f4f5; --muted: #a1a1aa; --bg: #18181b; --line: #3f3f46; --accent: #a78bfa; --blocked: #f87171;
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: var(--ink); }
.bar { position: fixed; top: 12px; right: 12px; z-index: 2147483647; display: flex; gap: 4px; align-items: center;
  padding: 4px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 6px 24px rgb(0 0 0 / 0.35); }
.brand { padding: 0 8px; font-weight: 600; letter-spacing: 0.02em; }
button, select { font: inherit; color: inherit; }
button { padding: 6px 10px; border: 1px solid transparent; border-radius: 7px; background: transparent; cursor: pointer; }
button:hover { background: #27272a; }
button[aria-pressed="true"] { background: #3b2f63; border-color: var(--accent); }
button:disabled { color: #71717a; cursor: not-allowed; background: transparent; }
button:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.primary { background: var(--accent); color: #18181b; font-weight: 600; }
.primary:hover { background: #c4b5fd; }
.sub { position: fixed; top: 58px; right: 12px; z-index: 2147483647; width: min(380px, calc(100vw - 24px)); display: flex; flex-direction: column; gap: 6px;
  padding: 8px 10px; background: var(--bg); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 6px 24px rgb(0 0 0 / 0.35); }
.sub p { margin: 0; }
.keys { color: var(--muted); font-size: 12px; }
.seg { display: inline-flex; align-self: flex-start; gap: 2px; padding: 2px; border: 1px solid var(--line); border-radius: 8px; }
.seg button { padding: 4px 12px; }
.items { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; overflow: auto; }
.items li { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; align-items: center; padding: 6px 8px; border: 1px solid var(--line); border-radius: 8px; }
.items input { font: inherit; color: inherit; background: #27272a; border: 1px solid var(--line); border-radius: 6px; padding: 4px 6px; min-width: 0; }
.items .meta { grid-column: 1; color: var(--muted); font-size: 12px; }
.items .row { grid-column: 2; grid-row: 1 / span 2; }
.highlight { position: fixed; z-index: 2147483646; pointer-events: none; border: 2px solid var(--accent); background: rgb(167 139 250 / 0.12); border-radius: 2px; }
.highlight.blocked { border-color: var(--blocked); background: rgb(120 120 120 / 0.35); }
.label { position: fixed; z-index: 2147483647; pointer-events: none; max-width: 360px; padding: 3px 7px; border-radius: 5px;
  background: var(--bg); border: 1px solid var(--line); font: 12px/1.35 ui-monospace, monospace; white-space: pre-wrap; }
.label .reason { display: block; color: var(--blocked); font-family: system-ui, sans-serif; }
.pad { position: fixed; z-index: 2147483645; pointer-events: none; border-style: solid; border-color: rgb(74 222 128 / 0.35); }
.margin { position: fixed; z-index: 2147483645; pointer-events: none; border-style: solid; border-color: rgb(251 146 60 / 0.3); }
.panel { position: fixed; right: 12px; bottom: 12px; z-index: 2147483647; width: min(460px, calc(100vw - 24px)); max-height: min(70vh, 640px);
  display: flex; flex-direction: column; gap: 10px; padding: 12px; background: var(--bg); border: 1px solid var(--line); border-radius: 12px;
  box-shadow: 0 10px 40px rgb(0 0 0 / 0.45); }
.panel h2 { margin: 0; font-size: 14px; font-weight: 600; }
.hint { margin: 0; color: var(--muted); }
.error { margin: 0; color: var(--blocked); }
.row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.file { font: 12px ui-monospace, monospace; color: var(--muted); word-break: break-all; }
pre { margin: 0; overflow: auto; padding: 10px; background: #09090b; border: 1px solid var(--line); border-radius: 8px;
  font: 12px/1.5 ui-monospace, monospace; white-space: pre; min-height: 80px; }
select { padding: 4px 6px; background: #27272a; border: 1px solid var(--line); border-radius: 6px; }
label { display: inline-flex; gap: 4px; align-items: center; color: var(--muted); }
@media (prefers-reduced-motion: no-preference) { .highlight { transition: top 60ms, left 60ms, width 60ms, height 60ms; } }
`;
