# Luci brand kit

Start with `BRAND.md`, then `DESIGN.md`, then `CLAUDE-CODE-GUIDE.md`. `BRAND.md` explains the personality, voice, colour roles, which mascot to use where, and the logo rules. This README covers the files.

Everything here is drawn for Luci, the ginger tabby mascot. Colours and art follow the canvas "Luci Mascot Character Pack and Brand Colors".

## Folders

| Folder | What it holds | Use it for |
| --- | --- | --- |
| `logo/` | Logo lockups, wordmark, app icon and small icon (SVG, plus PNG for the main lockups) | Website header, docs, social, slides |
| `favicon/` | favicon.ico, favicon.svg, PNG icons, web manifest and a `<head>` snippet | Your website |
| `mascot/` | Flat SVGs, one per pose and face | Static use: docs, slides, social posts |
| `layered/` | The same art with every part in a named group | Your own animation (CSS, After Effects, Rive, Figma) |
| `animated/` | Self-contained animated SVGs | Drop in with `<img src>`; they play anywhere SVG does |
| `luci-animations.css` | The animation styles | Animate the layered SVGs inline in a web page |
| `preview.html` | All animations on one page | Open in a browser to see them |
| `luci-tokens.json` | Colours plus fonts, radii, borders, sizes and motion timings | Code |
| `luci-colors.css`, `luci-colors.json` | Brand colours as CSS variables and tokens | Code and design tools |

## Layer names (in `layered/`)

Every SVG root has the class `luci` plus `luci-pose-<name>`. Parts are groups with these classes:

| Class | Part | Pivot for rotation or scale |
| --- | --- | --- |
| `luci-head` | Whole head, ears included | Bottom centre of the head |
| `luci-ear luci-ear-l` / `luci-ear-r` | Left and right ear, as seen by the viewer | Inner base of the ear |
| `luci-eye luci-eye-l` / `luci-eye-r` | Eye with its lid | Centre (scale Y to blink) |
| `luci-pupil` | Pupil and catch-light | Move left or right to glance |
| `luci-brows`, `luci-mouth`, `luci-nose`, `luci-whiskers`, `luci-stripes`, `luci-muzzle` | Face parts | Centre |
| `luci-body` | Body and chest | Bottom centre (scale Y to breathe) |
| `luci-paws` | Front and back paws | Bottom centre |
| `luci-tail luci-tail-wrap` / `luci-tail-up` | Tail wrapped round the paws, or raised | Where the tail meets the body |
| `luci-arm` | Raised front leg (measuring pose) | Shoulder |
| `luci-collar`, `luci-tag` | Lime collar and paw tag | Centre |
| `luci-zz`, `luci-z1`, `luci-z2` | Sleeping letters | Centre |
| `luci-ruler`, `luci-ruler-line` | Dimension marker (measuring pose) | Centre |
| `luci-box`, `luci-ledge` | Props | Bottom centre |

Clip paths have ids unique to each file, so several SVGs can sit inline on one page.

## Animations

| Name | Pose file | Motion | Use for |
| --- | --- | --- | --- |
| Idle | `luci-sit` | Breathe 4.5 s, blink every 6 s, ear twitch 7 s, tail sway 5 s | Default presence |
| Hello | `luci-sit` + class `luci-hello` | Slow blink and slight head tilt, 5 s | First run, greetings |
| Avatar | `luci-head` | Blink 6 s, ear flick 8 s | Small sizes, menu button |
| Watching | `luci-peek` | Pupils drift left and right, 7 s | Empty states |
| Measuring | `luci-measure` | Paw taps, line pulses, 1.6 s | Spacing tool |
| In the box | `luci-box` | Blink and glance | Capture basket |
| Asleep | `luci-sleep` | Breathe 3.5 s, floating z | Loading |
| Content | `luci-content` | Slow breathing, lazy tail | Success |
| Annoyed | `luci-annoyed` | Tail lash 0.9 s, ears bristle, fast breaths | Errors |
| Not now | `luci-turned` | Tail sway, ear twitch, head tilt | Paused, do not disturb, 404 |

All loops are seamless and stop under `prefers-reduced-motion: reduce`.

## Rules for new motion

- Keep him still by default. Motion is breathing, blinking, an ear or the tail.
- Slow is calm: most loops run 4 to 7 seconds. Only errors move fast.
- Never bounce, jump, wave or celebrate with confetti.
- Animate only transform and opacity, from the pivots above.

## Logo

| File | Use |
| --- | --- |
| `luci-logo-horizontal.svg` | Main logo: Luci's head plus the wordmark, on light backgrounds |
| `luci-logo-horizontal-dark.svg` | The same on Charcoal |
| `luci-logo-stacked.svg` | Square spaces: social avatars, posters |
| `luci-wordmark.svg`, `-dark`, `-mono` | Text only; the dot on the i is Luci's lime collar tag |
| `luci-mark.svg` | Luci's head alone, 32 px and up |
| `luci-mark-tile.svg` | App icon, small icon and favicon: head on a Ginger 500 tile, every size |

Rules: keep clear space equal to the height of the u; horizontal logo at least 96 px wide; never recolour the wordmark in ginger, stretch it, add shadows or change the lime dot.

## Favicon setup

1. Copy everything in `favicon/` to your site's public root (for Next.js or Vite, the `public/` folder).
2. Paste `head-snippet.html` into the page `<head>`.
3. Check the tab icon, then add the site to a phone home screen to check the app icon.
