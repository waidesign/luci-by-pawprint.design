# M4.6: the Chrome extension (packages/extension) is a thin WXT 0.21.5 shell around mountToolbar, with only activeTab, scripting and storage

- Date: 2026-11-12
- Status: accepted
- Area: Extension

## What
M4.6: the Chrome extension (packages/extension) is a thin WXT 0.21.5 shell around mountToolbar, with only activeTab, scripting and storage

## Why
Clicking the icon runs toolbar.js in that tab (activeTab + scripting); a second click closes it; unit and colour settings persist in chrome.storage.local; the toolbar state lives in the extension's isolated world, invisible to the page. No host permissions, no content scripts on every page. WXT needs Node 22+ to build (development only; the CLI still targets Node 18). pnpm test builds it and checks the manifest; pnpm typecheck also runs wxt prepare and type-checks the extension. Loading the unpacked extension in Chromium hangs start-up in this sandboxed environment (a one-line manifest hangs too; running outside the sandbox was declined), so the loaded-extension test is opt-in with LUCI_EXTENSION_E2E=1 and uses a test-only build (.output-test) that may also script 127.0.0.1, since a test cannot click the icon to grant activeTab. Vitest timeouts were raised to 30s per test and 60s per hook, because the browser suites run in parallel with the rest. M4 Done-when: every tool (single and system) yields a correct file on all five test sites (values equal getComputedStyle for the element the selector finds; files match reviewed golden files), and the toolbar is driven end to end in Chromium; the user still checks the extension by hand in real Chrome.

## Alternatives considered
_Not recorded._
