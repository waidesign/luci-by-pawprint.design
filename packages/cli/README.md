# Luci

**Design control for AI coding agents.** Luci gives your coding agent the project's memory, the right design skills, exact measurements from any page, and feedback pinned to the element. It runs on your machine.

Free and MIT licensed · No account · No telemetry · Works with Claude Code, Cursor, Codex, Gemini CLI and GitHub Copilot.

```bash
npx @luci-dev/cli@latest init
```

## What it does

- **Memory.** `luci init` creates a `.luci/` folder in your project: goal, stack, commands, rules, decisions and the active task. It also writes a short section into your agent's own file (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `GEMINI.md`, Copilot instructions) so every session starts from the same context.
- **Skills.** A ranked library of UI/UX, motion and front-end skills. Luci loads only the ones that fit the current task, so the agent's context stays small.
- **Dev toolbar.** Luci inside your running app:
  - **Feedback:** click an element (or tap it on a phone), write what should change, and copy one prompt with every note.
  - **Layout:** resize, move and space elements on the live page, then send the plan to your agent.
  - **Capture:** take a component, text, color or spacing as a design file the agent can read.
- **MCP server.** `luci-mcp` lets the agent read the project context, your notes and saved captures itself.

## Requirements

Node.js 18 or later.

## Get started

1. **Set up your project.** In your project folder:

   ```bash
   npx @luci-dev/cli@latest init
   ```

   It asks for the project's goal, suggests skills and rules, and offers to add the dev toolbar to your app (press Enter for yes).

2. **Start the toolbar's connection.** Leave this running while you work:

   ```bash
   npx @luci-dev/cli@latest serve
   ```

   Open your app on this machine. Luci's button is in the bottom corner. Notes and captures go into `.luci/`, where your agent reads them.

3. **Optional: connect your agent to `luci-mcp`.** Claude Code, from the project folder:

   ```bash
   claude mcp add luci -- npx -y @luci-dev/mcp@latest
   ```

   For other agents, add a stdio MCP server that runs `npx -y @luci-dev/mcp@latest` in the project folder. Copying the prompt from the toolbar works without it.

Prefer a `luci` command? Install it once:

```bash
npm install -g @luci-dev/cli
luci serve
```

## Common commands

| Command | What it does |
| :--- | :--- |
| `luci init` | Set up Luci in this project |
| `luci serve` | Connect the dev toolbar to this project |
| `luci toolbar` | Add the dev toolbar to your app (`luci toolbar remove` takes it out) |
| `luci start` | Show the active task and the context an agent needs |
| `luci doctor` | Check the install and this project, and say how to fix what is wrong |
| `luci update` | Refresh the files Luci wrote into this project |
| `luci skills use <task>` | Load the skills that fit a task |
| `luci --version` | Show the installed version |

`luci --help` lists everything.

## Updating

Luci never checks for updates on its own. A new version reaches you when you fetch it:

| How you run Luci | How to update |
| :--- | :--- |
| `npx @luci-dev/cli@latest …` | Nothing to do: `@latest` fetches the newest version every time. |
| Installed with `npm install -g @luci-dev/cli` | `npm install -g @luci-dev/cli@latest` |
| `luci-mcp` through `npx -y @luci-dev/mcp@latest` | Nothing to do: restart your agent to start the new version. |

**After updating:**

1. **Dev toolbar:** stop `luci serve` (Ctrl+C), start it again, and reload your app. The toolbar comes from the Luci you have installed, so the restart brings the new one. You do not need to run `luci toolbar` again.
2. **Project files:** run `luci doctor` in each project. If it says a Luci section is out of date, run `luci update`. It refreshes Luci's own files (`.luci/` context, agent files, skill catalog) and keeps your rules, decisions and notes.

`luci update` refreshes a project's files; it does not update Luci itself.

## Privacy

- Everything runs on your machine. `luci serve` listens on 127.0.0.1 only.
- No telemetry, accounts or API keys.
- Luci goes online only when you ask it to, for example `luci skills add <github-link>`.

## Links

- [Source code and full documentation](https://github.com/waidesign/luci-by-pawprint.design#readme)
- [Dev toolbar guide](https://github.com/waidesign/luci-by-pawprint.design/tree/main/packages/toolbar#readme)
- [Report a problem](https://github.com/waidesign/luci-by-pawprint.design/issues)

MIT licensed.
