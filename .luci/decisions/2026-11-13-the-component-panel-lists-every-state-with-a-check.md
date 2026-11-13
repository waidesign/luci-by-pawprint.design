# The Component panel lists every state with a check or "not detected"; "Capture by hand" defaults to All missing states, walked through one by one with a countdown, and page clicks are blocked meanwhile

- Date: 2026-11-13
- Status: accepted
- Area: Capture

## What
The Component panel lists every state with a check or "not detected"; "Capture by hand" defaults to All missing states, walked through one by one with a countdown, and page clicks are blocked meanwhile

## Why
User feedback 2026-11-13: the State box looked like the file held only one state. It never did (every readable state is in the file); the box was only for capturing a missed state by hand. Now: a states summary row; the box offers "All missing states (n)" by default (disabled excluded, it cannot be set by hand) and single states; each state gets its own 3-second countdown with a hint on how to put the component in it, and a Stop button. While capturing by hand (and 1.5s after), page clicks, submits and pointer handlers are stopped at window capture so pressing a link or button to show :active or :focus does not navigate. The "Not detected" text in files now says "Capture it by hand in Luci."

## Alternatives considered
_Not recorded._
