/** The toolbar's styles. They live in its shadow root, so the page and the toolbar never affect each other. */
export const TOOLBAR_CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.luci {
  --ink: #f5efea;
  --muted: #a39d96;
  --bg: #1f1f1f;
  --bg-subtle: #181818;
  --bg-elevated: #262626;
  --bg-field: #2b2b2b;
  --bg-hover: #353535;
  --bg-code: #141414;
  --line: #333333;
  --line-strong: #45423e;
  --accent: #f5efea;
  --accent-hover: #e5ddd3;
  --accent-soft: rgb(245 239 234 / 0.14);
  --accent-ink: #2b2b2b;
  --active-bg: #333333;
  --active-border: transparent;
  --danger-bg: #3d2424;
  --danger-hover: #4f2d2d;
  --danger-border: #854648;
  --danger-ink: #fca5a5;
  --blocked: #f87171;
  --shadow: 0 12px 36px rgb(18 18 21 / 0.48), 0 2px 8px rgb(18 18 21 / 0.28);
  font: 13px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--ink);
}
@media (prefers-color-scheme: light) {
  .luci:not([data-theme="dark"]) {
    --ink: #2b2b2b;
    --muted: #6e675f;
    --bg: #f5efea;
    --bg-subtle: #ebe4dc;
    --bg-elevated: #faf6f2;
    --bg-field: #faf6f2;
    --bg-hover: #e4dcd3;
    --bg-code: #faf6f2;
    --line: #dfd7ce;
    --line-strong: #cbbeb0;
    --accent: #2b2b2b;
    --accent-hover: #3d3d3d;
    --accent-soft: rgb(43 43 43 / 0.1);
    --accent-ink: #f5efea;
    --active-bg: #ded5cb;
    --active-border: transparent;
    --danger-bg: #f8d7d5;
    --danger-hover: #f2c2bf;
    --danger-border: #e4ada9;
    --danger-ink: #6e1f1d;
    --blocked: #dc2626;
    --shadow: 0 12px 36px rgb(43 43 43 / 0.14), 0 2px 8px rgb(43 43 43 / 0.08);
  }
}
.luci[data-theme="light"] {
  --ink: #2b2b2b;
  --muted: #6e675f;
  --bg: #f5efea;
  --bg-subtle: #ebe4dc;
  --bg-elevated: #faf6f2;
  --bg-field: #faf6f2;
  --bg-hover: #e4dcd3;
  --bg-code: #faf6f2;
  --line: #dfd7ce;
  --line-strong: #cbbeb0;
  --accent: #2b2b2b;
  --accent-hover: #3d3d3d;
  --accent-soft: rgb(43 43 43 / 0.1);
  --accent-ink: #f5efea;
  --active-bg: #ded5cb;
  --active-border: transparent;
  --danger-bg: #f8d7d5;
  --danger-hover: #f2c2bf;
  --danger-border: #e4ada9;
  --danger-ink: #6e1f1d;
  --blocked: #dc2626;
  --shadow: 0 12px 36px rgb(43 43 43 / 0.14), 0 2px 8px rgb(43 43 43 / 0.08);
}
.luci[data-theme="dark"] {
  --ink: #f5efea;
  --muted: #a39d96;
  --bg: #1f1f1f;
  --bg-subtle: #181818;
  --bg-elevated: #262626;
  --bg-field: #2b2b2b;
  --bg-hover: #353535;
  --bg-code: #141414;
  --line: #333333;
  --line-strong: #45423e;
  --accent: #f5efea;
  --accent-hover: #e5ddd3;
  --accent-soft: rgb(245 239 234 / 0.14);
  --accent-ink: #2b2b2b;
  --active-bg: #333333;
  --active-border: transparent;
  --danger-bg: #3d2424;
  --danger-hover: #4f2d2d;
  --danger-border: #854648;
  --danger-ink: #fca5a5;
  --blocked: #f87171;
  --shadow: 0 12px 36px rgb(18 18 21 / 0.48), 0 2px 8px rgb(18 18 21 / 0.28);
}

/* Unified floating card shell (Capture toolbar & Extension) */
.shell {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 2147483647;
  width: min(500px, calc(100vw - 24px));
  max-height: calc(100vh - 24px);
  display: flex;
  flex-direction: column;
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-radius: 14px;
  box-shadow: var(--shadow);
  overflow: hidden;
}
.luci[data-dock="left"] .shell,
.luci[data-dock="left"] .bar,
.luci[data-dock="left"] .sub,
.luci[data-dock="left"] .panel {
  right: auto;
  left: 12px;
}

.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px 10px;
  border-bottom: 1px solid var(--line);
  background: var(--bg);
  flex-shrink: 0;
}
.header.compact {
  align-items: center;
  padding: 8px 12px;
}
.brand-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  min-width: 0;
  flex: 1;
}
.header.compact .brand-row {
  align-items: center;
  gap: 8px;
}
.logo-mark {
  flex: none;
  width: 36px;
  height: 36px;
  border-radius: 9px;
  background: var(--bg-field);
  border: 1px solid var(--line-strong);
  color: var(--ink);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.logo-mark.compact {
  width: 26px;
  height: 26px;
  border-radius: 7px;
}
.brand-stack {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.brand-title-line {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-wrap: wrap;
}
.brand-title {
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--ink);
  line-height: 1.25;
}
.brand-sub {
  font-size: 11.5px;
  color: var(--muted);
  font-weight: 500;
}
.brand-desc {
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.35;
  margin-top: 1px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: none;
}
.ver-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border: 1px solid var(--line-strong);
  border-radius: 7px;
  background: var(--bg-field);
  color: var(--ink);
  font: 600 11px/1.2 ui-monospace, monospace;
}
.icon-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: var(--muted);
}
.icon-btn:hover,
.icon-btn[aria-pressed="true"] {
  color: var(--ink);
}

.bar {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 2147483647;
  display: flex;
  gap: 4px;
  align-items: center;
  padding: 5px 6px;
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-radius: 11px;
  box-shadow: var(--shadow);
}
.shell > .bar {
  position: static;
  flex-wrap: wrap;
  gap: 2px;
  padding: 6px 10px;
  border: 0;
  border-radius: 0;
  box-shadow: none;
  background: var(--bg);
  flex-shrink: 0;
}
.shell > .bar button {
  padding: 5px 7px;
  font-size: 12px;
  white-space: nowrap;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 6px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
button, select { font: inherit; color: inherit; }
button {
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  cursor: pointer;
}
button:hover { background: var(--bg-hover); }
button[aria-pressed="true"] {
  background: var(--active-bg);
  border-color: var(--active-border);
  font-weight: 600;
}
button:disabled { color: var(--muted); opacity: 0.55; cursor: not-allowed; background: transparent; }
button:focus-visible, select:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.btn-outline {
  border-color: var(--line-strong);
  background: var(--bg-field);
}
.btn-outline:hover { background: var(--bg-hover); }
.primary {
  background: var(--accent);
  color: var(--accent-ink);
  border-color: transparent;
  font-weight: 600;
}
.primary:hover { background: var(--accent-hover); }
.btn-with-ico {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
}
.btn-ico {
  width: 14px;
  height: 14px;
  flex: none;
}
.btn-danger,
button[data-item-remove],
button[data-action="clear-basket"],
button[data-action="clear-basket-confirm"],
button[data-action="undo-edits"],
button[data-action="delete"],
button[data-action="clear-done"],
button[data-action="clear-all"],
button[data-action="clear-all-confirm"],
button[data-action="remove-insert"],
button[data-action="wf-clear"],
button[data-action="wf-remove-block"],
button[data-action="wf-remove-row"] {
  background: var(--danger-bg);
  border-color: var(--danger-border);
  color: var(--danger-ink);
  font-weight: 500;
}
.btn-danger:hover:not(:disabled),
button[data-item-remove]:hover:not(:disabled),
button[data-action="clear-basket"]:hover:not(:disabled),
button[data-action="clear-basket-confirm"]:hover:not(:disabled),
button[data-action="undo-edits"]:hover:not(:disabled),
button[data-action="delete"]:hover:not(:disabled),
button[data-action="clear-done"]:hover:not(:disabled),
button[data-action="clear-all"]:hover:not(:disabled),
button[data-action="clear-all-confirm"]:hover:not(:disabled),
button[data-action="remove-insert"]:hover:not(:disabled),
button[data-action="wf-clear"]:hover:not(:disabled),
button[data-action="wf-remove-block"]:hover:not(:disabled),
button[data-action="wf-remove-row"]:hover:not(:disabled) {
  background: var(--danger-hover);
  border-color: var(--danger-border);
}
.btn-danger:disabled,
button[data-action="clear-done"]:disabled,
button[data-action="clear-all"]:disabled,
button[data-action="wf-remove-row"]:disabled {
  background: var(--danger-bg);
  border-color: var(--danger-border);
  color: var(--danger-ink);
  opacity: 0.45;
}

.sub {
  position: fixed;
  top: 58px;
  right: 12px;
  z-index: 2147483647;
  width: min(380px, calc(100vw - 24px));
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 12px;
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  box-shadow: var(--shadow);
}
.shell > .sub {
  position: static;
  width: auto;
  border: 0;
  border-top: 1px solid var(--line);
  border-radius: 0;
  box-shadow: none;
  background: var(--bg-subtle);
  padding: 10px 14px;
  flex-shrink: 0;
}
.sub p { margin: 0; }
.keys { color: var(--muted); font-size: 12px; }
.seg {
  display: inline-flex;
  align-self: flex-start;
  gap: 2px;
  padding: 2px;
  background: var(--bg-subtle);
  border: 1px solid var(--line-strong);
  border-radius: 8px;
}
.seg button { padding: 4px 10px; font-size: 12px; }
.seg button[aria-pressed="true"] {
  background: var(--bg-field);
  border-color: var(--line-strong);
  box-shadow: 0 1px 2px rgb(43 43 43 / 0.08);
}
.items { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; overflow: auto; }
.items li { display: grid; grid-template-columns: 1fr auto; gap: 4px 8px; align-items: center; padding: 8px 10px; background: var(--bg-elevated); border: 1px solid var(--line-strong); border-radius: 8px; }
.files { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.files li { display: flex; gap: 8px; align-items: center; justify-content: space-between; padding: 5px 8px; background: var(--bg-elevated); border: 1px solid var(--line-strong); border-radius: 7px; }
.files code, [data-part="file-view-box"] code { font: 12px ui-monospace, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
pre.preview { margin: 0; max-height: 240px; overflow: auto; white-space: pre-wrap; font: 12px/1.45 ui-monospace, monospace; }
.items textarea { grid-column: 1 / -1; font: 12px/1.4 system-ui, sans-serif; color: inherit; background: var(--bg-field); border: 1px solid var(--line-strong); border-radius: 6px; padding: 5px 7px; min-height: 34px; resize: vertical; }
.items input { font: inherit; color: inherit; background: var(--bg-field); border: 1px solid var(--line-strong); border-radius: 6px; padding: 4px 7px; min-width: 0; }
.items .meta { grid-column: 1; color: var(--muted); font-size: 12px; }
.items .row { grid-column: 2; grid-row: 1 / span 2; }
.stack { display: flex; flex-direction: column; align-items: stretch; gap: 5px; color: var(--ink); }
textarea { font: 12px/1.5 ui-monospace, monospace; color: inherit; background: var(--bg-code); border: 1px solid var(--line-strong); border-radius: 8px; padding: 8px 10px; resize: vertical; }
textarea[data-part="instructions"] { font: 13px/1.45 system-ui, sans-serif; background: var(--bg-field); }
textarea.preview { min-height: 168px; flex: 1; white-space: pre; overflow: auto; }
textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.dim { color: var(--muted); font-size: 12px; font-weight: 400; margin: 0; }
.pick-layer { position: fixed; inset: 0; z-index: 2147483640; cursor: crosshair; background: transparent; touch-action: none; }
.pixel-layer { position: fixed; inset: 0; z-index: 2147483640; cursor: crosshair; background: transparent; }
.swatch { position: fixed; z-index: 2147483647; pointer-events: none; display: flex; gap: 6px; align-items: center; padding: 4px 8px;
  background: var(--bg); border: 1px solid var(--line-strong); border-radius: 6px; font: 12px ui-monospace, monospace; box-shadow: var(--shadow); }
.chip { width: 16px; height: 16px; border-radius: 4px; border: 1px solid rgb(244 244 245 / 0.4); }

/* State pills & manual state row (Wireframe 1) */
.states-list { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 2px; }
.state {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 7px;
  border: 1px solid var(--line-strong);
  background: var(--bg-field);
  font-size: 12px;
  font-weight: 500;
  color: var(--ink);
}
.state.default {
  background: var(--active-bg);
  border-color: var(--line-strong);
  font-weight: 600;
}
.state.detected:not(.default) {
  background: var(--bg-field);
  border-color: var(--line-strong);
}
.state.missing {
  color: var(--muted);
  background: transparent;
  border-style: dashed;
}
.manual-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding-top: 4px;
}
.manual-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

/* 3-column settings grid (Wireframe 1) */
.settings-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.field-stack {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  color: var(--ink);
}
.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
}
.field-stack select {
  width: 100%;
}

/* Selected item card & Tip box (Wireframe 2) */
.selected-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: var(--bg-elevated);
}
.selected-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.selected-card h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}
.tip-box {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-subtle);
  border: 1px solid var(--line);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.45;
}

/* Extracted .md tinted bottom section (Wireframe 1) */
.panel.result-panel {
  padding: 0;
  gap: 0;
}
.panel-body {
  display: flex;
  flex-direction: column;
  gap: 11px;
  padding: 12px 14px;
}
.md-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px 14px;
  background: var(--bg-subtle);
  border-top: 1px solid var(--line);
}
.md-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}
.md-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
}
.file-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 9px;
  border-radius: 7px;
  background: var(--bg-subtle);
  border: 1px solid var(--line);
}
.scope-pill {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--bg-field);
  border: 1px solid var(--line-strong);
  font-size: 11px;
  color: var(--muted);
  flex: none;
}

/* Settings panel rows */
.settings-appearance {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}
.setting-copy {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.settings-divider {
  height: 1px;
  background: var(--line);
  border: 0;
  margin: 2px 0;
}
.shortcut-list {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 4px 10px;
  align-items: center;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--bg-subtle);
  border: 1px solid var(--line);
  font-size: 12px;
}
.kbd {
  display: inline-block;
  padding: 1px 6px;
  border-radius: 5px;
  border: 1px solid var(--line-strong);
  background: var(--bg-field);
  font: 11px/1.3 ui-monospace, monospace;
  color: var(--ink);
}

.highlight.locked { border-width: 2px; border-style: solid; background: var(--accent-soft); box-shadow: 0 0 0 2px rgb(43 43 43 / 0.45); }
.highlight { position: fixed; z-index: 2147483646; pointer-events: none; border: 2px solid var(--accent); background: var(--accent-soft); border-radius: 2px; }
.highlight.blocked { border-color: var(--blocked); background: rgb(120 120 120 / 0.35); }
.label { position: fixed; z-index: 2147483647; pointer-events: none; max-width: 360px; padding: 3px 7px; border-radius: 5px;
  background: var(--bg); border: 1px solid var(--line-strong); font: 12px/1.35 ui-monospace, monospace; white-space: pre-wrap; box-shadow: var(--shadow); }
.label .reason { display: block; color: var(--blocked); font-family: system-ui, sans-serif; }
.pad { position: fixed; z-index: 2147483645; pointer-events: none; border-style: solid; border-color: rgb(74 222 128 / 0.35); }
.margin { position: fixed; z-index: 2147483645; pointer-events: none; border-style: solid; border-color: rgb(251 146 60 / 0.3); }
.panel {
  position: fixed;
  right: 12px;
  bottom: 12px;
  z-index: 2147483647;
  width: min(468px, calc(100vw - 24px));
  max-height: min(72vh, 660px);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 14px;
  background: var(--bg);
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  box-shadow: var(--shadow);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.shell > .panel {
  position: static;
  width: auto;
  max-height: none;
  flex: 1 1 auto;
  min-height: 0;
  border: 0;
  border-top: 1px solid var(--line);
  border-radius: 0;
  box-shadow: none;
}
.panel > * { flex-shrink: 0; }
.panel > .items, .panel > .diffs { flex-shrink: 1; }
.panel h2 { margin: 0; font-size: 14px; font-weight: 600; }
.hint { margin: 0; color: var(--muted); }
.error { margin: 0; color: var(--blocked); }
.row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.file { font: 12px ui-monospace, monospace; color: var(--muted); word-break: break-all; }
pre { margin: 0; overflow: auto; padding: 10px; background: var(--bg-code); border: 1px solid var(--line-strong); border-radius: 8px;
  font: 12px/1.5 ui-monospace, monospace; white-space: pre; min-height: 80px; }
select { padding: 5px 8px; background: var(--bg-field); border: 1px solid var(--line-strong); border-radius: 7px; }
label { display: inline-flex; gap: 4px; align-items: center; color: var(--muted); }
@media (prefers-reduced-motion: no-preference) { .highlight { transition: top 60ms, left 60ms, width 60ms, height 60ms; } }
[data-part="check-summary"] { margin: 0; }
.row .rule { order: 1; flex-basis: 100%; max-height: 132px; overflow: auto; padding: 8px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--bg-elevated); }
.rule code { font: 12px/1.5 ui-monospace, monospace; white-space: pre-wrap; word-break: break-word; }
.diffs { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; overflow: auto; min-height: 60px; }
.diffs li { display: flex; flex-direction: column; gap: 2px; padding: 6px 8px; border: 1px solid var(--line-strong); border-radius: 8px; background: var(--bg-elevated); }
.diffs li.high { border-color: var(--blocked); }
.diffs label { align-items: flex-start; gap: 8px; color: var(--ink); }
.diffs input { flex: none; margin: 3px 0 0; accent-color: var(--accent); }
.diffs .dim { padding-left: 21px; }
.files li > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.modes { margin-right: 4px; }
.modes button { padding: 4px 10px; color: var(--muted); }
.modes button[aria-pressed="true"] { color: var(--ink); }
.loading { display: flex; gap: 10px; align-items: center; margin: 0; color: var(--ink); }
.loading .steps { color: var(--muted); font-size: 12px; }
/* Spins with transform only: the browser keeps it moving off the page's main thread, even while Luci reads a heavy page */
.spinner { flex: none; width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--line-strong); border-top-color: var(--accent);
  animation: luci-spin 0.8s linear infinite; will-change: transform; }
button .spinner { display: inline-block; width: 12px; height: 12px; margin-right: 6px; vertical-align: -2px; }
@keyframes luci-spin { to { transform: rotate(360deg); } }
@keyframes luci-pulse { 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .spinner { animation: luci-pulse 1.6s ease-in-out infinite; border-color: var(--accent); } }
`;
