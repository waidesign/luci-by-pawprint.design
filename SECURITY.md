# Security policy

## Reporting a vulnerability

Please report security problems privately, not in a public issue:
**[Report a vulnerability](https://github.com/waidesign/luci-by-pawprint.design/security/advisories/new)**
(GitHub's private vulnerability reporting).

Include what you found, how to reproduce it, and which version (`luci --version`, or the extension's
version in `chrome://extensions`). You'll get a reply within a few days. Once a fix is released, the
advisory is published with credit to you unless you'd rather stay anonymous.

## Supported versions

Fixes go into the latest release. Update with `npm install -g @luci-dev/cli@latest` (or use
`npx @luci-dev/cli@latest`), and keep the Chrome extension up to date.

## What Luci exposes, and how it is protected

Luci runs on your own computer and sends nothing to any server of ours. The parts that are reachable
from a browser:

- **`luci serve`** (the bridge between the browser and your project) listens on `127.0.0.1` only. It
  answers only requests whose Host is `127.0.0.1` or `localhost` (against DNS rebinding), only pages on
  this machine or browser extensions (CORS), and every write needs a JSON body and the `x-luci` header.
  It reads and writes only inside the project's `.luci/feedback/` and `.luci/design/`, by strict file
  names, and reads source maps inside the project to find source lines.
- **The dev toolbar loader** that `luci toolbar` adds to your app runs only on `localhost`,
  `127.0.0.1` or `[::1]`, and in frameworks with a build step only in development.
- **The Chrome extension** runs only in the tab where you click its icon (`activeTab`), has no content
  scripts on other pages, connects only to `luci serve` on this machine, and uses the `debugger`
  permission only during a capture that needs exact states or widths (it can be turned off in its
  settings). In Team Feedback, a reviewer's name appears only in the review they choose to send to a
  teammate; the prompt for the agent and the notes saved in the project carry their role only.

Commands that use the network do so only when you run them (see the README's Privacy section).

Reports about any of these boundaries are especially welcome.
