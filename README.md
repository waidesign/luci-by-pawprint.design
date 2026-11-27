# Luci

<p align="center">
  <strong>The local-first toolkit that gives AI coding agents memory, UI/UX skills, live design capture, and precise feedback.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@luci-dev/cli"><img src="https://img.shields.io/npm/v/@luci-dev/cli.svg?color=6366f1" alt="npm version" /></a>
  <a href="https://github.com/waidesign/luci-by-pawprint.design/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg" alt="Node >= 18" />
  <img src="https://img.shields.io/badge/privacy-100%25%20local-success.svg" alt="100% Local" />
</p>

---

## What is Luci?

AI coding agents often struggle with four fundamental things:
1. **They forget:** Rules, architecture decisions, and preferences have to be restated in every session.
2. **Skills are all-or-nothing:** Dumping hundreds of guidelines fills the context window; loading none leaves the agent guessing.
3. **Design context is lossy:** Screenshot interpretations guess CSS values, losing exact spacing, tokens, and pseudo-states.
4. **Visual feedback is fragmented:** Feedback across pages or components rarely reaches the agent as a clean, structured prompt.

**Luci solves this with four tightly integrated modules running entirely on your machine:**

* **Brain**: Manages project memory, architecture decisions, and active task tracking across all your agents.
* **Skills**: A curated library of UI/UX, motion, and front-end skills loaded on-demand based on relevance to the current task.
* **Capture**: An on-page toolbar and Chrome extension that inspects real DOM elements and exports structured `DESIGN.md` tokens, typography, colors, spacing, and hover/focus/active states.
* **Feedback**: An interactive on-page canvas to annotate elements, test layouts, and generate consolidated prompts that an agent can implement in one turn.

---

## Quick Start

Requires Node 18 or later.

```bash
npm install -g @luci-dev/cli
luci init
luci serve
```

Once installed, open your running app in **Chrome** or **Edge** on this machine: Luci's button appears in the bottom corner. (`luci-dev` also works as an alias for `luci`.)

* **Chrome extension:** to capture designs and collect team feedback on any website, [add Luci to Chrome](https://chromewebstore.google.com/detail/luci/hjgfoiecmdjankhmifdicejiolnfkfmn) (works in Edge too).
* **Without installing (CI or one-off runs):** `npx @luci-dev/cli@latest <command>`
* **Windows note:** if PowerShell blocks `luci` (`luci.ps1`), use **Command Prompt** or run `luci.cmd` instead. (Changing the PowerShell execution policy is an advanced option and never required.)

---

## Commands

The ones you will use most:

| Command | What it does |
| :--- | :--- |
| `luci init` | Set up Luci in this project |
| `luci serve` | Connect the dev toolbar to this project (leave it running) |
| `luci toolbar` | Add the dev toolbar to your app |
| `luci start` | Show the active task and the context an agent needs |
| `luci skills use <task>` | Load the skills that fit a task |
| `luci doctor` | Check the install and this project, and say how to fix what is wrong |
| `luci update` | Refresh the files Luci wrote into this project |

**[Full command reference](./docs/COMMANDS.md):** every terminal command and option, the dev toolbar's tools and keys, the Chrome extension, and the tools your agent can call through `luci-mcp`.

---

## Updating Luci

Luci never checks for updates on its own (it makes no network calls). A new version reaches you when you fetch it:

| How you run Luci | How to update |
| :--- | :--- |
| `npx @luci-dev/cli@latest …` | Nothing to do: `@latest` fetches the newest version every time. |
| Installed with `npm install -g @luci-dev/cli` | `npm install -g @luci-dev/cli@latest` |
| Agent connected to `luci-mcp` with `npx -y @luci-dev/mcp@latest` | Nothing to do: restart your agent to start the new version. |

Check which version you have with `luci --version`. The newest is on [npm](https://www.npmjs.com/package/@luci-dev/cli).

**After updating:**

1. **Dev toolbar:** stop `luci serve` (Ctrl+C), start it again, and reload your app. `luci serve` gives the browser the toolbar from the Luci you have installed, so the restart is what brings the new one. You do not need to run `luci toolbar` again.
2. **Project files:** run `luci doctor` in each project. If it says a Luci section is out of date, run `luci update`. That refreshes the files Luci wrote into the project (`.luci/` context, agent files such as `CLAUDE.md`, the skill catalog) and keeps your own rules, decisions and notes.

`luci update` refreshes a project's files; it does not update Luci itself.

---

## Key Modules

### 1. Brain (`@luci-dev/brain`)
- Writes and maintains `.luci/` in your repository.
- Keeps project rules, architectural decisions (`.luci/decisions/`), and active task scope.
- Automatically generates tailored instructions for your agents:
  - `CLAUDE.md` (Claude Code)
  - `AGENTS.md` (Codex / Agentic IDEs)
  - `.cursorrules` (Cursor)
  - `GEMINI.md` (Gemini CLI)

### 2. Skills (`@luci-dev/skills`)
- A ranked library of high-quality UI/UX, layout, typography, animation, and front-end engineering skills.
- Only injects the exact skills needed for the active task—preserving context window tokens.

### 3. Capture (`@luci-dev/capture` & Extension)
- Available in the dev toolbar (`luci serve`) or as a Chrome extension (Manifest V3, tested in Chrome and Edge): **[Add to Chrome](https://chromewebstore.google.com/detail/luci/hjgfoiecmdjankhmifdicejiolnfkfmn)**.
- Inspect your running app or any live page:
  - **Component Picker**: Captures HTML anatomy, Tailwind tokens, or CSS variables.
  - **States**: Detects `:hover`, `:focus-visible`, and `:active` styles.
  - **Color & Spacing System**: Generates full palette scales and spacing ladders (Pixel color mode uses the browser's EyeDropper API in Chrome and Edge).
  - **Whole page**: The page's type, colours, spacing, components and a `## Sections` blueprint of its bands (header, hero, sections, footer).
  - **Design Basket**: Collect multiple elements across pages and download as a single `DESIGN.md`.
- **Files**: `DESIGN.md` (Google Stitch format) by default, or Luci tables, Tailwind and CSS Variables. **Smart units** by default: rem for text and spacing, fluid `%`/`vw`/`vh` kept as written, px for borders, radii and shadows.
- **Design Check**: Compares a built component with its saved design file, live, and checks again after every hot reload.
- **Crawl a site**: `luci capture crawl <urls...>` captures several pages into one design system; `--storybook` crawls every story of a Storybook.

### 4. Feedback (`@luci-dev/feedback`)
- Click to annotate elements (the note's number sits exactly where you clicked), select text typos, or plan layout changes on the live page in **Layout** mode.
- **Team Feedback**: Reviewers annotate live or staging sites in the Chrome extension's **Team Feedback** tab, copy one review (plain text plus a compact `luci-review` block), and send it over Slack or email. The designer pastes reviews into the dev toolbar's **Builder** tab to merge duplicates, filter by role, confirm placement, check notes against `.luci/design/` rules, and preview the exact text before anything reaches the agent. Reviewer names stay with the people; the agent only sees roles.
- **After-Edit Blink**: When your agent's edit hot-reloads, the elements you noted pulse once, with a before/after peek and a jump to changes off-screen (respects reduced motion; on/off in settings).
- **Storybook**: `luci toolbar --storybook` adds the dev toolbar to Storybook, notes are kept per story, and the extension works inside Storybook's canvas.
- Automatically resolves component source files through source maps (React, Vue 3, Svelte 5).
- Bundles notes into a clean prompt ready for your agent to execute.

---

## Privacy & Local-First

- **100% Local**: Everything runs on `localhost` (`127.0.0.1`).
- **Zero Telemetry**: No tracking, analytics, or background network calls.
- **No Cloud Dependency**: No API keys, accounts, or logins required.
- **Commands that use the network (only when you run them)**:
  - `luci skills add <github-link>` (fetches the skill from GitHub)
  - `luci skills licenses` (checks personal skill licences on GitHub)
  - `luci map --install` (downloads `uv` and Graphify after asking for confirmation)
  - `luci capture crawl <urls...>` (visits the URLs you pass)
- **Sends notes only where you tell it to**: the Feedback webhook (off until you set a URL) posts your notes to that URL only when you press **Send**.
- Found a security problem? Please report it privately: see [SECURITY.md](SECURITY.md).

---

## Monorepo Architecture

Luci is organized as a pnpm monorepo:

| Package | Version | Description |
| :--- | :--- | :--- |
| [`@luci-dev/cli`](./packages/cli) | `0.6.0` | Core CLI (`luci` / `luci-dev`) |
| [`@luci-dev/brain`](./packages/brain) | `0.6.0` | Project memory, agent configs, and rules engine |
| [`@luci-dev/skills`](./packages/skills) | `0.6.0` | Skill registry, ranker, and library |
| [`@luci-dev/capture`](./packages/capture) | `0.6.0` | Live DOM capture and token capture |
| [`@luci-dev/feedback`](./packages/feedback) | `0.6.0` | Interactive on-page annotations & prompt generator |
| [`@luci-dev/toolbar`](./packages/toolbar) | `0.6.0` | Standalone dev toolbar bundle |
| [`@luci-dev/ui`](./packages/ui) | `0.6.0` | Shared Preact design system & tokens |
| [`@luci-dev/format`](./packages/format) | `0.6.0` | Markdown schemas, `DESIGN.md` parser, and diffing |
| [`@luci-dev/mcp`](./packages/mcp) | `0.6.0` | Model Context Protocol server for IDEs & agents |
| [`@luci-dev/extension`](./packages/extension) | `0.6.0` | Chrome extension (Manifest V3) |

---

## Development

```bash
# Clone the repository
git clone https://github.com/waidesign/luci-by-pawprint.design.git
cd luci-by-pawprint.design

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run type checks
pnpm typecheck

# Run test suite
pnpm test
```

Every push and pull request to `main` runs the same checks on GitHub (**CI**). Releases go out from GitHub too: see [Releasing Luci](./docs/RELEASING.md).

Contributions are welcome: read [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md) first.

---

## License

The code is MIT licensed. The Luci name, logo and mascot are not covered by the MIT licence and may not be used to suggest endorsement or for other products. See [LICENSE](LICENSE) and [TRADEMARKS.md](TRADEMARKS.md).

---

Luci by [Pawprint Design](https://pawprint.design)
