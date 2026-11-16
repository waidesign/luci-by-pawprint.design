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

### Use without installing

Initialize Luci in your existing project directory:

```bash
npx @luci-dev/cli init
```

### Install CLI globally

```bash
npm install -g @luci-dev/cli
```

Once installed, use either `luci` or `luci-dev`:

```bash
# Start the Luci development server & bridge
luci serve

# Check project health & agent configurations
luci doctor

# Search and load design skills
luci skills list
```

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
- Available as a browser extension (Chrome MV3) or via `luci serve`.
- Inspect any live website or local prototype:
  - **Component Picker**: Extracts HTML anatomy, Tailwind tokens, or CSS variables.
  - **State Extractor**: Detects `:hover`, `:focus-visible`, and `:active` styles.
  - **Color & Spacing System**: Generates full palette scales and spacing ladders.
  - **Design Basket**: Collect multiple elements across sites and download as a single `DESIGN.md`.

### 4. Feedback (`@luci-dev/feedback`)
- Click to annotate elements, select text typos, or sketch layout changes.
- Automatically resolves component source files through source maps (React, Vue 3, Svelte 5).
- Bundles notes into a clean prompt ready for your agent to execute.

---

## Privacy & Local-First

- **100% Local**: Everything runs on `localhost`.
- **Zero Telemetry**: No tracking, analytics, or external calls.
- **No Cloud Dependency**: No API keys, accounts, or logins required.

---

## Monorepo Architecture

Luci is organized as a pnpm monorepo:

| Package | Version | Description |
| :--- | :--- | :--- |
| [`@luci-dev/cli`](./packages/cli) | `0.5.4` | Core CLI (`luci` / `luci-dev`) |
| [`@luci-dev/brain`](./packages/brain) | `0.5.4` | Project memory, agent configs, and rules engine |
| [`@luci-dev/skills`](./packages/skills) | `0.5.4` | Skill registry, ranker, and library |
| [`@luci-dev/capture`](./packages/capture) | `0.5.4` | Live DOM capture and token extractor |
| [`@luci-dev/feedback`](./packages/feedback) | `0.5.4` | Interactive on-page annotations & prompt generator |
| [`@luci-dev/toolbar`](./packages/toolbar) | `0.5.4` | Standalone dev toolbar bundle |
| [`@luci-dev/ui`](./packages/ui) | `0.5.4` | Shared Preact design system & tokens |
| [`@luci-dev/format`](./packages/format) | `0.5.4` | Markdown schemas, `DESIGN.md` parser, and diffing |
| [`@luci-dev/mcp`](./packages/mcp) | `0.5.4` | Model Context Protocol server for IDEs & agents |
| [`@luci-dev/extension`](./packages/extension) | `0.5.4` | Chrome extension (Manifest V3) |

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

---

## License

[MIT](LICENSE) © [Pawprint Design](https://pawprint.design)
