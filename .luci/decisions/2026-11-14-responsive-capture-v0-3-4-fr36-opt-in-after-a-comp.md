# Responsive capture (v0.3.4, FR36): opt-in after a component or section capture ("How it changes by width"). Widths come from the media queries that style it (a rule inside matches it or a descendant, or sets a custom property on an ancestor): at most the two breakpoints with the most rules, read at a phone (375px or just under the first), the breakpoint between, and a desktop (1280px or the last breakpoint); a phone and a desktop when none. Two readers: the extension resizes the tab with Emulation.setDeviceMetricsOverride through the debugger (background SET_VIEWPORT, detached when put back); any shell falls back to hidden same-origin frames named luci-width (the dev toolbar script does not mount there). Format: responsive { widths, queries, changes[part, property, values] } on component and section, a ## Responsive table; grid columns compared by count, part visibility as `shown`, sizes authored the same everywhere left out as fluid.

- Date: 2026-11-14
- Status: accepted
- Area: architecture

## What
Responsive capture (v0.3.4, FR36): opt-in after a component or section capture ("How it changes by width"). Widths come from the media queries that style it (a rule inside matches it or a descendant, or sets a custom property on an ancestor): at most the two breakpoints with the most rules, read at a phone (375px or just under the first), the breakpoint between, and a desktop (1280px or the last breakpoint); a phone and a desktop when none. Two readers: the extension resizes the tab with Emulation.setDeviceMetricsOverride through the debugger (background SET_VIEWPORT, detached when put back); any shell falls back to hidden same-origin frames named luci-width (the dev toolbar script does not mount there). Format: responsive { widths, queries, changes[part, property, values] } on component and section, a ## Responsive table; grid columns compared by count, part visibility as `shown`, sizes authored the same everywhere left out as fluid.

## Why
Reading the real layout at each width catches fluid values and layout changes that stylesheet parsing would miss. Frames let the dev toolbar work without a debugger; reading them showed that Luci's rule walkers used instanceof CSSStyleRule and the global matchMedia, which fail for another window: realm.ts now checks rule kinds by constructor name and media in the element's own window (no change for the page itself). Opt-in because frames reload the page and the extension shows the debugging bar.

## Alternatives considered
_Not recorded._
