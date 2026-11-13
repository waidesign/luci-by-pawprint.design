# American spelling "Color" everywhere users see it (toolbar, hints, file headings); the extension explains a lost connection; tests drive the extension from its help page

- Date: 2026-11-13
- Status: accepted
- Area: Extension

## What
American spelling "Color" everywhere users see it (toolbar, hints, file headings); the extension explains a lost connection; tests drive the extension from its help page

## Why
User feedback on 2026-11-13. (1) "Colour" became "Color" in the toolbar, hints, capture file headings (## Color, the Colors group of a basket export, the Color column) and docs; golden files were regenerated and the diff was only the spelling. The PRD text was left as written. (2) Pixel mode showed "Could not establish connection. Receiving end does not exist." The built background starts and registers its listeners (checked by running it with a fake chrome); the error comes from a toolbar whose extension was reloaded or updated (unpacked extensions serve the new toolbar.js from disk at once while the old background keeps running until Luci is reloaded). The toolbar now says "Luci was updated or restarted ... Reload this page, then click Luci's icon again", and a newly mounted toolbar tells any older one (another JavaScript world) to shut down through a DOM event. (3) `pnpm test:extension` froze at 2/5: Chrome stops an idle background after ~30s and the test kept waiting on the stale handle with no timeout. Tests now call extension APIs from the extension's help page with a 20s limit. (4) A help page (help.html, opened by a new "?" button through the background) explains the three steps, the tools, states, the basket and keys; a test checks it opens through the background.

## Alternatives considered
_Not recorded._
