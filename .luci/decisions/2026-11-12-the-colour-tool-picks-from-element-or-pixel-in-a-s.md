# The Colour tool picks from Element or Pixel in a strip under the bar; every tool shows a hint strip while picking

- Date: 2026-11-12
- Status: accepted
- Area: Capture

## What
The Colour tool picks from Element or Pixel in a strip under the bar; every tool shows a hint strip while picking

## Why
User feedback after trying the extension in real Chrome on 2026-11-12: Text and Spacing work well, but "Pick a pixel" at the end of the bar looked like a separate tool, far from Colour. Now the bar holds only the tools; while a tool is picking, a strip directly under the bar says what to click and which keys work, and for Colour it has an Element / Pixel switch. Pixel opens the eyedropper at once; Esc in the eyedropper returns to Element. Without the EyeDropper API, Pixel stays visible but disabled, with the reason. Tested with a stand-in eyedropper. The user's manual check in real Chrome stands in for the loaded-extension test that cannot run in this sandbox; `pnpm test:extension` runs it on a normal machine.

## Alternatives considered
_Not recorded._
