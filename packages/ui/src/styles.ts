/**
 * Base and component styles for every Luci surface (brand/DESIGN.md sections 4 to 9). Colours,
 * sizes and motion come only from the tokens (var(--luci-*)); this file holds no colour values.
 * Surfaces render inside a shadow root: put UI_CSS in it and class "luci-theme" on their root.
 */
import { TOKENS_CSS } from './tokens.js';
import { ANIMATIONS_CSS } from './mascot/art.js';

export const BASE_CSS = `
.luci-theme {
  /* Buttons: md is 40 px with 15 px labels (DESIGN.md section 6); a compact surface sets sm as its default */
  --luci-btn-h: 40px;
  --luci-btn-font: 15px;
  --luci-btn-line: 20px;
  --luci-btn-pad: var(--luci-space-16);
  font-family: var(--luci-font-body);
  font-size: var(--luci-type-body-size);
  line-height: var(--luci-type-body-line);
  font-weight: var(--luci-type-body-weight);
  color: var(--luci-color-ink);
  -webkit-font-smoothing: antialiased;
}
.luci-theme *, .luci-theme *::before, .luci-theme *::after { box-sizing: border-box; }
.luci-theme :where(button, input, select, textarea) { font: inherit; color: inherit; }
.luci-theme :where(code, kbd, pre, samp) { font-family: var(--luci-font-code); }
.luci-theme :where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
  outline: 2px solid var(--luci-color-focus);
  outline-offset: 2px;
}
/* Type roles */
.t-display { font: var(--luci-type-display-weight) var(--luci-type-display-size)/var(--luci-type-display-line) var(--luci-font-display); }
.t-title { font: var(--luci-type-title-weight) var(--luci-type-title-size)/var(--luci-type-title-line) var(--luci-font-display); margin: 0; }
.t-heading { font: var(--luci-type-heading-weight) var(--luci-type-heading-size)/var(--luci-type-heading-line) var(--luci-font-body); margin: 0; }
.t-small { font-size: var(--luci-type-small-size); line-height: var(--luci-type-small-line); font-weight: var(--luci-type-small-weight); }
.t-micro { font-size: var(--luci-type-micro-size); line-height: var(--luci-type-micro-line); font-weight: var(--luci-type-micro-weight); }
.t-code { font: var(--luci-type-code-weight) var(--luci-type-code-size)/var(--luci-type-code-line) var(--luci-font-code); }
.overline { font-size: var(--luci-type-micro-size); line-height: var(--luci-type-micro-line); font-weight: var(--luci-type-micro-weight);
  letter-spacing: 0.06em; text-transform: uppercase; color: var(--luci-color-link); }
/* Icons follow the text colour */
.icon { flex: none; display: block; }
/* The mascot */
.mascot { display: inline-block; flex: none; line-height: 0; }
.mascot svg { display: block; width: 100%; height: auto; }
.luci-still, .luci-still * { animation: none !important; }
.luci-avatar { display: inline-flex; flex: none; align-items: center; justify-content: center; border-radius: var(--luci-radius-full);
  background: var(--luci-color-primary); overflow: hidden; }
/* Reduced motion: UI transitions become instant; the kit's CSS stops the mascot loops */
@media (prefers-reduced-motion: reduce) {
  .luci-theme *, .luci-theme *::before, .luci-theme *::after { transition-duration: 0s !important; }
}
`;

export const COMPONENTS_CSS = `
/*
 * Button (DESIGN.md section 6). Variants: btn-primary, btn-secondary, btn-outline, btn-ghost (also a
 * bare button), btn-danger, btn-link; btn-icon for icon-only (square, round). Sizes: btn-sm 32,
 * btn-md 40, btn-lg 48 (default: the surface's). States: hover, :active (pressed), :focus-visible,
 * :disabled, aria-pressed="true" (toggled on), aria-busy="true" (working).
 */
.luci-theme button {
  position: relative;
  display: inline-block;
  vertical-align: middle;
  min-height: var(--luci-btn-h);
  padding: calc((var(--luci-btn-h) - var(--luci-btn-line)) / 2) var(--luci-btn-pad);
  border: 0;
  border-radius: var(--luci-radius-full);
  background: transparent;
  color: var(--luci-color-ink);
  font-size: var(--luci-btn-font);
  font-weight: 600;
  line-height: var(--luci-btn-line);
  text-align: center;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color var(--luci-motion-fast), color var(--luci-motion-fast), transform var(--luci-motion-fast);
}
/* Every button is a 44 px target, even when it is drawn 32 px tall */
.luci-theme button::before { content: ""; position: absolute; inset: min(0px, calc((var(--luci-btn-h) - var(--luci-size-touch-target)) / 2)) 0; }
.luci-theme button:hover:not(:disabled) { background: var(--luci-color-ghost-hover); }
.luci-theme button:active:not(:disabled) { transform: translateY(1px); }
.luci-theme button:disabled { color: var(--luci-color-ink-disabled); background: transparent; cursor: not-allowed; }
.luci-theme button[aria-busy="true"] { cursor: progress; }
/* On (a tool, a toggle, a segment): one look everywhere, the kit's active tool fill (ginger-400, Charcoal text, 6.9:1) */
.luci-theme button[aria-pressed="true"]:not(.btn-primary),
.luci-theme button[aria-pressed="true"]:not(.btn-primary):hover:not(:disabled) { background: var(--luci-color-tool-active); color: var(--luci-color-on-tool-active); }
/* A small count on a button */
.btn-badge { position: absolute; top: 0; right: 0; min-width: 18px; height: 18px; padding: 0 5px; border-radius: var(--luci-radius-full);
  background: var(--luci-color-accent); color: var(--luci-color-on-accent); font: 600 11px/18px var(--luci-font-body); text-align: center; pointer-events: none; }

/* Sizes */
.luci-theme .btn-sm { --luci-btn-h: 32px; --luci-btn-font: var(--luci-type-small-size); --luci-btn-line: var(--luci-type-small-line); --luci-btn-pad: var(--luci-space-12); }
.luci-theme .btn-md { --luci-btn-h: 40px; --luci-btn-font: 15px; --luci-btn-line: 20px; --luci-btn-pad: var(--luci-space-16); }
.luci-theme .btn-lg { --luci-btn-h: 48px; --luci-btn-font: 15px; --luci-btn-line: 20px; --luci-btn-pad: var(--luci-space-20); }

/* Text with an icon, and icon only */
.luci-theme .btn-with-ico { display: inline-flex; align-items: center; justify-content: center; gap: var(--luci-space-8); padding-block: 0; }
.luci-theme .btn-with-ico .icon { margin-inline-start: calc(var(--luci-space-4) * -1); }
.luci-theme .btn-icon { display: inline-flex; align-items: center; justify-content: center; width: var(--luci-btn-h); height: var(--luci-btn-h); padding: 0; }
.luci-theme .btn-icon::before { inset: min(0px, calc((var(--luci-btn-h) - var(--luci-size-touch-target)) / 2)); }

/* Variants */
.luci-theme .btn-primary { background: var(--luci-color-primary); color: var(--luci-color-on-primary); }
.luci-theme .btn-primary:hover:not(:disabled) { background: var(--luci-color-primary-hover); }
.luci-theme .btn-primary:disabled { background: var(--luci-color-surface-sunken); color: var(--luci-color-ink-disabled); }
.luci-theme .btn-secondary { background: var(--luci-color-surface-raised); border: 1px solid var(--luci-color-stroke-subtle);
  padding-block: calc((var(--luci-btn-h) - var(--luci-btn-line)) / 2 - 1px); }
.luci-theme .btn-secondary:hover:not(:disabled) { background: var(--luci-color-secondary-hover); }
.luci-theme .btn-secondary:disabled { background: var(--luci-color-surface-raised); }
.luci-theme .btn-outline { background: transparent; border: 1px solid var(--luci-color-stroke-subtle);
  padding-block: calc((var(--luci-btn-h) - var(--luci-btn-line)) / 2 - 1px); }
.luci-theme .btn-outline:hover:not(:disabled) { background: var(--luci-color-ghost-hover); border-color: var(--luci-color-stroke-strong); }
.luci-theme :is(.btn-secondary, .btn-outline):is(.btn-with-ico, .btn-icon) { padding-block: 0; }
.luci-theme .btn-ghost { background: transparent; }
.luci-theme .btn-danger { background: var(--luci-color-danger-bg); color: var(--luci-color-danger); }
.luci-theme .btn-danger:hover:not(:disabled) { background: var(--luci-color-danger-hover); }
.luci-theme .btn-danger:disabled { background: var(--luci-color-danger-bg); color: var(--luci-color-danger); opacity: 0.5; }
.luci-theme .btn-link { min-height: 0; padding: 0; border-radius: var(--luci-radius-sm); background: transparent; color: var(--luci-color-link);
  font-weight: 500; text-decoration: underline; text-decoration-color: transparent; text-underline-offset: 3px;
  transition: text-decoration-color var(--luci-motion-fast); }
.luci-theme .btn-link:hover:not(:disabled) { background: transparent; text-decoration-color: currentColor; }
.luci-theme .btn-link:active:not(:disabled) { transform: none; }
.luci-theme .btn-link::before { inset: -8px -4px; }
/* Working: the label stays for layout, a ring turns over it */
.luci-theme button[aria-busy="true"] > * { opacity: 0.4; }
.badge, .count { display: inline-flex; align-items: center; justify-content: center; height: 22px; padding: 0 var(--luci-space-8);
  border-radius: var(--luci-radius-full); font-size: var(--luci-type-micro-size); line-height: var(--luci-type-micro-line);
  font-weight: var(--luci-type-micro-weight); white-space: nowrap; }
.badge { background: var(--luci-color-surface-sunken); color: var(--luci-color-ink); }
.badge.brand { background: var(--luci-color-primary-soft); color: var(--luci-color-link); }
.count { min-width: 22px; background: var(--luci-color-accent); color: var(--luci-color-on-accent); }

/* Status message and toast: tinted fill, the status icon and coloured title, Charcoal detail, no stroke */
.status-msg { display: flex; gap: var(--luci-space-12); align-items: flex-start; margin: 0; padding: var(--luci-space-12) var(--luci-space-16);
  border-radius: var(--luci-radius-lg); background: var(--status-bg); color: var(--luci-color-muzzle-900); }
.status-msg.success { --status: var(--luci-color-success); --status-bg: var(--luci-color-success-bg); }
.status-msg.warning { --status: var(--luci-color-warning); --status-bg: var(--luci-color-warning-bg); }
.status-msg.danger { --status: var(--luci-color-danger); --status-bg: var(--luci-color-danger-bg); }
.status-msg.info { --status: var(--luci-color-info); --status-bg: var(--luci-color-info-bg); }
.status-msg > .icon { color: var(--status); margin-top: 2px; }
.status-msg .status-body { display: flex; flex-direction: column; gap: var(--luci-space-4); min-width: 0; }
.status-msg .status-title { margin: 0; color: var(--status); font-size: var(--luci-type-heading-size); line-height: var(--luci-type-heading-line); font-weight: var(--luci-type-heading-weight); }
.status-msg .status-detail { margin: 0; }
.status-msg .mascot { width: 48px; }
.toast { position: fixed; z-index: 2147483647; box-shadow: var(--luci-shadow-float); }

/* Card and panel */
.card { padding: var(--luci-space-24); border: 1px solid var(--luci-color-stroke-subtle); border-radius: var(--luci-radius-xl); background: var(--luci-color-surface-raised); }

/* Input, select and text area */
.luci-theme :where(input[type="text"], input[type="search"], input[type="number"], input[type="url"], input:not([type]), select, textarea) {
  min-height: var(--luci-btn-h);
  padding: 0 var(--luci-space-12);
  border: 1px solid var(--luci-color-stroke-subtle);
  border-radius: var(--luci-radius-sm);
  background-color: var(--luci-color-surface-raised);
  color: var(--luci-color-ink);
  transition: border-color var(--luci-motion-fast);
}
.luci-theme :where(textarea) { padding: var(--luci-space-8) var(--luci-space-12); resize: vertical; }
/* Select: the component wraps it with the kit's chevron icon, 12 px from the edge */
.luci-theme :where(select) { appearance: none; padding-inline-end: 36px; text-overflow: ellipsis; cursor: pointer; }
.select { position: relative; display: inline-flex; vertical-align: middle; min-width: 0; }
.select > select { flex: 1 1 auto; min-width: 0; }
.select > .icon { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; }
.luci-theme :where(input, select, textarea):hover:not(:disabled) { border-color: var(--luci-color-stroke-strong); }
.luci-theme ::placeholder { color: var(--luci-color-ink-secondary); opacity: 1; }
.luci-theme :where(input[type="checkbox"], input[type="radio"]) { accent-color: var(--luci-color-primary); }
.field-error { display: flex; gap: var(--luci-space-4); align-items: center; margin: 0; color: var(--luci-color-danger);
  font-size: var(--luci-type-small-size); line-height: var(--luci-type-small-line); }

/* The repository pill: GitHub's mark and Luci's version, in the code font (a link once the repository is public) */
.luci-theme .repo-btn { position: relative; display: inline-flex; flex: none; align-items: center; gap: 6px; height: 32px; padding: 0 var(--luci-space-12);
  border: 1px solid var(--luci-color-stroke-subtle); border-radius: var(--luci-radius-full); background: var(--luci-color-surface-raised);
  color: var(--luci-color-ink); font: 600 13px/1 var(--luci-font-code); text-decoration: none; white-space: nowrap; }
.luci-theme a.repo-btn:hover { background: var(--luci-color-ghost-hover); }
.luci-theme a.repo-btn:focus-visible { outline: 2px solid var(--luci-color-focus); outline-offset: 2px; }
.luci-theme .repo-btn .gh-mark { display: block; width: 16px; height: 16px; line-height: 0; }
.luci-theme .repo-btn .gh-mark svg { display: block; width: 16px; height: 16px; }
/* It sits at a panel's right edge: its tooltip opens leftwards, so the panel never scrolls sideways */
.luci-theme .repo-btn[data-tip]::after { left: auto; right: 0; transform: translate(0, -4px); }
.luci-theme .repo-btn[data-tip]:is(:hover, :focus-visible)::after { transform: translate(0, 0); }

/* Tooltip: the text in data-tip; below the element, or above with data-tip-pos="above". Shows after 300 ms. */
.luci-theme [data-tip]::after { content: attr(data-tip); position: absolute; left: 50%; top: calc(100% + var(--luci-space-8)); z-index: 3;
  width: max-content; max-width: 240px; padding: 6px 10px; border-radius: var(--luci-radius-md); background: var(--luci-color-ink);
  color: var(--luci-color-surface); font-size: var(--luci-type-small-size); line-height: var(--luci-type-small-line); font-weight: var(--luci-type-small-weight);
  white-space: pre; text-align: left; pointer-events: none; opacity: 0; transform: translate(-50%, -4px);
  transition: opacity var(--luci-motion-exit), transform var(--luci-motion-exit); }
.luci-theme [data-tip][data-tip-pos="above"]::after { top: auto; bottom: calc(100% + var(--luci-space-8)); transform: translate(-50%, 4px); }
.luci-theme [data-tip]:is(:hover, :focus-visible)::after { opacity: 1; transform: translate(-50%, 0);
  transition: opacity var(--luci-motion-base) 300ms, transform var(--luci-motion-base) 300ms; }

/* Empty state: Luci, a title, one line, an optional primary button */
.empty { display: flex; flex-direction: column; align-items: center; gap: var(--luci-space-12); padding: var(--luci-space-24) var(--luci-space-16); text-align: center; }
.empty .t-title { margin: 0; }
.empty p:not(.t-title) { margin: 0; color: var(--luci-color-ink-secondary); }
`;

/** Everything a Luci surface needs in its shadow root, in order. */
export const UI_CSS = `${TOKENS_CSS}\n${ANIMATIONS_CSS}\n${BASE_CSS}\n${COMPONENTS_CSS}`;
