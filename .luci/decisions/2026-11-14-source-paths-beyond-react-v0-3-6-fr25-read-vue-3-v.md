# Source paths beyond React (v0.3.6, FR25): read Vue 3 __vueParentComponent (type.__file / type.__name, walking .parent) and Svelte 4/5 __svelte_meta (loc.file/line/column, walking Svelte 5 dev_stack parent or Svelte 4 ancestor DOM elements) directly from DOM nodes without importing Vue or Svelte runtimes.

- Date: 2026-11-14
- Status: accepted
- Area: feedback

## What
Source paths beyond React (v0.3.6, FR25): read Vue 3 __vueParentComponent (type.__file / type.__name, walking .parent) and Svelte 4/5 __svelte_meta (loc.file/line/column, walking Svelte 5 dev_stack parent or Svelte 4 ancestor DOM elements) directly from DOM nodes without importing Vue or Svelte runtimes.

## Why
FR25 requires Feedback and Layout mode to report component trees and source file paths for Vue and Svelte projects alongside React.

## Alternatives considered
_Not recorded._
