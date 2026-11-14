# Luci brand guide (for people and coding agents)

Read this file, then `DESIGN.md` (component and token rules), then `CLAUDE-CODE-GUIDE.md` (how to build with the kit), before building any Luci interface, page or message. It is the single source for Luci's look, motion and voice. Files referred to are in this kit.

## 1. Who Luci is

Luci is the product and its mascot: a short-haired ginger tabby, based on a real cat.

Personality, in order of importance:

1. **Calm.** Still by default. Half-closed eyes. Slow motion.
2. **A little fierce.** Maine Coon brow and tufted ears. He looks like he means it.
3. **Humble.** Reports what happened. No bragging, no praise.
4. **Independent.** Does not obey blindly. If a request looks wrong, he says so.
5. **Not an attention seeker.** No pop-ups, nudges, streaks or badges asking for attention.
6. **Understands everything that matters.** Ignores noise, notices every pixel, state and gap.

## 2. Voice and microcopy

Rules:

- Short sentences. Facts before feelings.
- No exclamation marks, no emoji, no confetti, no "oops", "yay" or "buddy".
- Numbers over adjectives: "6 of 6 applied", not "everything went great".
- Show Luci only when something needs the user.

| Moment | Not Luci | Luci |
| --- | --- | --- |
| First run | Hi friend! I'm Luci, your new buddy! | Luci is ready. Pick something. |
| Success | Yay, you did it! All done! | Done. 6 of 6 applied. |
| Empty | Aww, it's lonely in here! | Nothing captured yet. |
| Loading | Hang tight, working my magic! | Waiting for your agent. |
| Error | Oopsie, something went wrong! | That is an image. Pick the card around it. |
| Pushback | Sure, whatever you say! | That selector no longer matches. Pick it again. |
| Warning | Uh oh, we missed something! | Hover state not detected. Hover the button, then capture again. |

## 3. Colour

Exact values are in `luci-colors.css` (CSS variables) and `luci-colors.json`.

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Surface | `--luci-surface` / muzzle-50 | #F5EFEA | Default page and panel background |
| Raised surface | muzzle-0 | #FDF9F6 | Cards on the surface |
| Ink | `--luci-ink` / muzzle-900 | #2B2B2B | Text, outlines, dark toolbar |
| Secondary text | muzzle-600 | #656360 | Captions, hints (darker steps also fine) |
| Border | muzzle-200 | #DBD4CF | Card borders, dividers |
| Primary | `--luci-primary` / ginger-500 | #EC862B | Primary buttons, brand fills |
| On primary | `--luci-on-primary` | #2B2B2B | Text on ginger-500 (never white) |
| Link | `--luci-link` / ginger-700 | #AD4F1A | Links and ginger text on light surfaces |
| Active tool | ginger-400 | #F6A24F | Selected state in the dark toolbar |
| Accent | `--luci-accent` / collar-lime-500 | #B4D43C | Counts and the basket badge, small doses only |
| Success | success-700 on success-100 | #3F7932 / #DFF3D5 | |
| Warning | warning-700 on warning-100 | #975F03 / #FEEDC9 | |
| Danger | danger-700 on danger-100 | #C5372F / #FFE3DF | |
| Info | info-700 on info-100 | #1E767F / #D9F0F3 | |

Contrast rules (WCAG AA, 4.5:1 for body text):

- Never white text on ginger-400, 500 or 600.
- Never ginger-500 or ginger-600 text on Muzzle White; use ginger-700 or darker.
- Dark mode: Muzzle White text on Charcoal, ginger-400 for accents.

## 4. Type, shape and line

| Item | Value |
| --- | --- |
| Display font | Fredoka 600 (headings, empty-state titles) |
| Body font | Inter 400 / 500 / 600 |
| Code font | JetBrains Mono 500, or the system monospace |
| Card radius | 24 px; inner panels 16 px; buttons and pills fully round |
| Borders | Subtle neutral only: 1 px `rgba(43,43,43,0.12)` or #DBD4CF. No coloured or Charcoal borders on components (see `DESIGN.md` section 4) |
| Outline style | Mascot and logo art only: one Charcoal line, round caps and joins, flat fills. UI components do not copy it |
| Touch targets | At least 44 px |

## 5. Mascot: which file for which moment

Use one mascot per screen, at 96 px or larger (avatar and icons excepted). Animated versions: `animated/luci-<name>-animated.svg` as an image, or the layered SVG inline with `luci-animations.css`.

| Moment in the product | Pose | Static file | Animated file |
| --- | --- | --- | --- |
| Default, docs headers | Sitting tall | `mascot/luci-sit.svg` | `luci-sit-animated.svg` |
| First run, greeting | Slow blink | `mascot/luci-slowblink.svg` | `luci-hello-animated.svg` |
| Menu button, avatar | Head | `mascot/luci-head.svg` | `luci-head-animated.svg` |
| Empty states, toolbar idle | Watching | `mascot/luci-peek.svg` | `luci-peek-animated.svg` |
| Spacing and ruler tool | Measuring | `mascot/luci-measure.svg` | `luci-measure-animated.svg` |
| Capture basket, saved captures | In the box | `mascot/luci-box.svg` | `luci-box-animated.svg` |
| Loading, waiting for the agent | Asleep | `mascot/luci-sleep.svg` | `luci-sleep-animated.svg` |
| Success, all items done | Content | `mascot/luci-content.svg` | `luci-content-animated.svg` |
| Errors, blocked actions | Annoyed | `mascot/luci-annoyed.svg` | `luci-annoyed-animated.svg` |
| Paused, do not disturb, 404 | Turned away | `mascot/luci-turned.svg` | `luci-turned-animated.svg` |

Small faces for toasts and inline messages (48 px): `mascot/luci-face-<calm|focused|unimpressed|slowblink|alert|annoyed|asleep>.svg`.

| Toast | Face |
| --- | --- |
| Success | slowblink |
| Warning | focused |
| Error | annoyed |
| Info | calm |

Mascot rules:

- Never make him grin, wave, jump, wink at the user or celebrate with confetti.
- Never recolour, stretch or dress him, or place him on ginger-400 to 600.
- Keep the brow, half-closed eyes, lime collar and forehead M in every full-body pose.

## 6. Motion

- Default is stillness. Motion is breathing, blinking, an ear flick or the tail.
- Most loops run 4 to 7 seconds. Only the error loop is fast (0.9 s).
- Animate transform and opacity only. Pivots and layer names are listed in `README.md`.
- Respect `prefers-reduced-motion: reduce`: everything stops (already in `luci-animations.css`).
- UI transitions: 150 to 200 ms, ease-out. No bounce or spring overshoot.

## 7. Logo

| Need | File |
| --- | --- |
| Site header, docs | `logo/luci-logo-horizontal.svg` (dark backgrounds: `-dark`) |
| Square spaces | `logo/luci-logo-stacked.svg` |
| Text only | `logo/luci-wordmark.svg` |
| App icon | `logo/luci-mark-tile.svg` |
| 16 to 48 px, favicon | `logo/luci-mark-tile.svg` (the app icon at every size) |
| Favicon set | everything in `favicon/` plus `favicon/head-snippet.html` |

Rules: clear space equal to the height of the u; horizontal logo at least 96 px wide; wordmark only in Charcoal or Muzzle White, never ginger; the dot on the i is always Collar Lime.

## 8. UI patterns already designed

- **On-page toolbar:** Charcoal pill; Luci's head in a Ginger 500 circle as the menu button; tool buttons are 48 px round with 22 px line icons in Muzzle White; the active tool gets a ginger-400 fill with Charcoal icon; the basket is a Collar Lime pill with Charcoal text ("Basket 3").
- **Toast:** status background colour, no border, 16 px radius, float shadow, 48 px mascot face on the left, bold status-700 title, one Charcoal line of detail.
- **Empty state:** centred mascot (Watching), Fredoka title, one line of Inter, one primary pill button (Ginger 500, Charcoal text, no border).
