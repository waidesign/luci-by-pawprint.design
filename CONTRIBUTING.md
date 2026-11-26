# Contributing to Luci

Thanks for helping. Luci is free and open source (MIT), and small, focused pull requests are the
easiest to review and merge.

## Before you start

- **Bugs:** open an issue with the bug template: what you did, what you expected, what happened, your
  OS, browser and `luci --version`.
- **Features:** open an issue first so we can agree on the shape before you write code.
- **Security problems:** don't open an issue. See [SECURITY.md](SECURITY.md).

## Set up

You need Node 18 or later (CI uses Node 24) and pnpm (the version is pinned in `package.json`;
`corepack enable` picks it up).

```bash
git clone https://github.com/waidesign/luci-by-pawprint.design.git
cd luci-by-pawprint.design
pnpm install
pnpm build
```

| Command | What it does |
| :--- | :--- |
| `pnpm build` | Builds every package and the toolbar bundles |
| `pnpm typecheck` | Type checks everything, including tests and the extension |
| `pnpm test` | Runs the whole test suite (vitest; browser tests use Playwright's Chromium) |
| `pnpm check` | `typecheck` then `test`: what CI runs on every pull request |
| `pnpm --filter @luci-dev/extension build` | Builds the Chrome extension into `packages/extension/.output/chrome-mv3` |

The first time, install Chromium for the browser tests: `pnpm exec playwright install chromium`.

To try your changes in a real app, run `node <path-to-this-repo>/packages/cli/dist/bin.js init` and
`node <path-to-this-repo>/packages/cli/dist/bin.js serve` in that app's folder, or load the extension unpacked from
`packages/extension/.output/chrome-mv3` in `chrome://extensions`.

## How the code is organised

A pnpm monorepo. Each package in `packages/` has its own README:
`cli` (the `luci` command), `brain` (project memory and agent files), `skills` (the skill library and
ranker), `capture` (design capture), `feedback` (notes, Layout and Team Feedback), `toolbar` (the dev
toolbar served by `luci serve`), `ui` (shared design system), `format` (file formats and schemas),
`mcp` (the MCP server) and `extension` (the Chrome extension).

## Rules for changes

- **Local first.** No telemetry, analytics, accounts or background network calls. A command may use the
  network only when the person runs it for that purpose, and the README lists it.
- **Tests with behaviour changes.** Every fix or feature comes with a test that fails without it.
- **No new dependencies** without discussing it in the issue first.
- **TypeScript (strict) and vitest.** No other frameworks, UI, styling, animation or test libraries.
- **File formats** (`docs/format/`) are read by agents and other tools: changes need an issue first and
  must stay readable by older files.
- **Skills library:** a skill is added only when its licence allows redistribution, with its source and
  licence recorded in its `luci.json`. After changing the skills package, run `node scripts/eval.mjs`;
  the score must not drop below `eval/baseline.json`.
- **Brand:** the Luci name, logo and mascot in `brand/` are not covered by the MIT licence. See
  [TRADEMARKS.md](TRADEMARKS.md).

## Pull requests

1. Branch from `main`.
2. Keep the change focused; explain what and why in the description.
3. Run `pnpm check` and make sure it passes.
4. Use clear commit messages, for example `fix(capture): …`, `feat(feedback): …`, `docs: …`.

By contributing, you agree that your contribution is licensed under the MIT licence and that you will
follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Agent files in this repository

`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursorrules` and the others are the files Luci writes into
every project: this repository uses Luci on itself. They point into `.luci/`, the maintainers' private
project memory, which is not published. If you work with an AI agent, point it at this file instead.
