# Extension tests never build into .output/ (the folder the user loads in Chrome); messaging errors show Chrome's own text; Pixel falls back to the eyedropper

- Date: 2026-11-13
- Status: accepted
- Area: Extension

## What
Extension tests never build into .output/ (the folder the user loads in Chrome); messaging errors show Chrome's own text; Pixel falls back to the eyedropper

## Why
User report 2026-11-13: after reloading, Pixel and the "?" button still failed (toolbar-to-background messages), while storage worked, and `pnpm test:extension` failed one test and ran long. The built background handler and start-up are correct (checked in the bundle and by running it with a fake chrome). Likely cause: the test suite rebuilt packages/extension/.output/chrome-mv3, the very folder loaded in the user's Chrome, deleting it under the running extension. Tests now build into .output-check/ and .output-test/ (LUCI_EXTENSION_OUT_DIR), and a check confirms .output/ is untouched. The toolbar no longer hides errors behind a generic "lost connection" message: it shows Chrome's own text (only "Extension context invalidated" becomes the reload instruction) and logs it; "?" shows an alert with the reason when it fails; Pixel falls back to the browser eyedropper with a note when the screenshot is unavailable. API call limit in tests lowered to 10s.

## Alternatives considered
_Not recorded._
