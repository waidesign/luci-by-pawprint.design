# motion-dev and animejs are Luci's own skills, written new

- Date: 2026-11-12
- Status: accepted
- Area: Skills

## What
motion-dev and animejs are Luci's own skills, written new

## Why
2026-11-12. The user wants both in Luci. The libraries (Motion, Anime.js) are open source, but the prototype's skill texts had no traceable source, and a library's licence does not cover someone else's write-up about it, so those copies could not ship. Luci wrote its own skills for both from the libraries' public APIs (author Luci, MIT), kept in scripts/library-own/ and copied in by scripts/build-library.mjs. Both are in the animation-library group (packages motion/framer-motion and animejs), so a project gets only the one it has installed; the motion pack offers them. Their keywords and the Anime.js description were trimmed on the tuning set so no benchmark score drops (all equal to the baseline). The two tuning cases that originally accepted motion-dev accept it again.

## Alternatives considered
_Not recorded._
