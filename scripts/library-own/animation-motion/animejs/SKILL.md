---
name: "animejs"
description: "Timelines, staggers, and SVG line drawing and morphing with Anime.js v4. Use when the project depends on animejs and needs choreographed or SVG animation."
license: "MIT"
metadata:
  luci-title: "Anime.js"
  luci-category: "animation-motion"
  luci-author: "Luci"
  luci-version: "1.0.0"
  luci-tags: "animejs, anime.js, timeline, stagger, svg animation, scroll animation"
---

# Anime.js

Anime.js v4 is a small, framework-free animation engine with named ES exports. Version 3 code (`anime({ targets, easing })`) does not run on v4: use the v4 API below, and check the installed version in package.json first.

## Before you animate
- Every animation has a job: show cause and effect, guide attention, or keep context. Remove the rest.
- Animate transforms (`x`, `y`, `scale`, `rotate`) and `opacity`; avoid width, height, top and left.
- Respect reduced motion: check `window.matchMedia('(prefers-reduced-motion: reduce)').matches` and skip movement or jump to the end state.
- Clean up: keep the returned animation and call `revert()` when the component or page goes away.

## Core API (v4)
```ts
import { animate, createTimeline, stagger, svg, onScroll, utils } from 'animejs';

// One animation
animate('.card', { opacity: [0, 1], y: [16, 0], duration: 400, ease: 'outQuad' });

// Staggered list
animate('.list li', { opacity: [0, 1], x: [-12, 0], delay: stagger(60) });

// Choreography: steps run in order; a position string overlaps them
createTimeline({ defaults: { duration: 500, ease: 'outExpo' } })
  .add('.title', { y: [24, 0], opacity: [0, 1] })
  .add('.subtitle', { opacity: [0, 1] }, '-=300')
  .add('.cta', { scale: [0.9, 1], opacity: [0, 1] });

// SVG: draw a stroke, or morph one path into another
animate(svg.createDrawable('.logo path'), { draw: ['0 0', '0 1'], duration: 1200, ease: 'inOutQuad' });
animate('#shape-a', { d: svg.morphTo('#shape-b'), duration: 800 });

// Start when scrolled into view
animate('.reveal', { opacity: [0, 1], y: [24, 0], autoplay: onScroll({ enter: 'bottom top' }) });
```

Eases in v4 drop the old `ease` prefix: `outQuad`, `inOutCubic`, `outElastic(1, .6)`, `linear`. Repeat with `loop: true` and `alternate: true`; start later with `delay`.

## In React
Create animations in an effect and revert them on cleanup. `createScope({ root: ref })` limits selectors to the component and reverts everything at once:
```tsx
useEffect(() => {
  const scope = createScope({ root: rootRef }).add(() => {
    animate('.item', { opacity: [0, 1], delay: stagger(50) });
  });
  return () => scope.revert();
}, []);
```

## Checks
- With reduced motion on, nothing moves (or it jumps to the end state).
- Animations are reverted on unmount; no warnings about missing targets after navigation.
- Only transforms and opacity animate; no layout shift.
- The code uses the v4 API matching the installed version.
