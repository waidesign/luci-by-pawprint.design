---
name: "motion-dev"
description: "Production UI animation with Motion (motion.dev, formerly Framer Motion): springs, gestures, enter and exit, layout transitions and scroll effects that respect reduced motion. Use when the project depends on motion or framer-motion and a component needs animation."
license: "MIT"
metadata:
  luci-title: "Motion (motion.dev)"
  luci-category: "animation-motion"
  luci-author: "Luci"
  luci-version: "1.0.0"
  luci-tags: "motion, framer-motion, react animation, spring, gestures, layout animation"
---

# Motion (motion.dev)

Motion animates React components (`motion/react`) and plain DOM elements (`motion`). Projects on the older package import from `framer-motion`; keep whichever the project already has and never add both.

## Before you animate
- Every animation has a job: show cause and effect, guide attention, or keep context during a change. Remove decoration that does none of these.
- Animate `transform` and `opacity` only. Use the `layout` prop instead of animating width, height, top or left.
- Respect reduced motion: wrap the app once in `<MotionConfig reducedMotion="user">`, or read `useReducedMotion()` and replace movement with a fade.
- Durations: 150 to 250ms for feedback (hover, press, toggles), 250 to 400ms for entering content. Prefer springs for anything the user drags or touches.

## React patterns
```tsx
import { motion, AnimatePresence, MotionConfig } from 'motion/react';

// Enter, and exit when removed (AnimatePresence must stay mounted around the conditional)
<AnimatePresence>
  {open && (
    <motion.div
      key="panel"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    />
  )}
</AnimatePresence>

// Gesture feedback
<motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }} />

// Layout changes and shared elements
<motion.li layout />
<motion.div layoutId="active-tab-indicator" />

// Reveal once when scrolled into view
<motion.section initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} />
```

Scroll-linked values: `const { scrollYProgress } = useScroll({ target: ref })` then `useTransform(scrollYProgress, [0, 1], [0, -80])` into a `style` prop. Lists: give each child `variants` and stagger from the parent with `transition: { staggerChildren: 0.05 }`.

## Without React
```ts
import { animate, inView, scroll } from 'motion';

animate('.card', { opacity: [0, 1], y: [12, 0] }, { duration: 0.3 });
inView('.reveal', (el) => { animate(el, { opacity: 1 }); });
scroll(animate('.progress', { scaleX: [0, 1] }));
```

## Bundle size
For large apps use `LazyMotion` with `domAnimation` and the `m` component instead of `motion`, so features load only where used.

## Checks
- Every animation still makes sense with reduced motion on (fade or no movement).
- Only transform and opacity animate; no layout shift in the performance panel.
- Exit animations run (AnimatePresence wraps the conditional, each child has a stable `key`).
- Interactions stay usable while animating: no blocked clicks, focus stays visible.
