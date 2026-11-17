# @luci-dev/mcp

`luci-mcp`: the MCP server that lets your coding agent read a project's Luci memory, skills, feedback notes and saved design captures. Part of [Luci](https://github.com/waidesign/luci-by-pawprint.design#readme), design control for AI coding agents.

## Connect your agent

Set up the project first, in its folder:

```bash
npx @luci-dev/cli@latest init
```

Then add the server. Claude Code, from the project folder:

```bash
claude mcp add luci -- npx -y @luci-dev/mcp@latest
```

Other agents: add a stdio MCP server that runs `npx -y @luci-dev/mcp@latest`, started in the project folder (`luci-mcp` reads the project it is started in).

## What the agent can do

- `get_project_context`, `get_active_task`: the project's goal, rules, decisions and current task.
- `load_project_skills`: the skills that fit the current task.
- `get_feedback_prompt`, `list_feedback`, `watch_feedback`: your notes from the dev toolbar (read only: you decide what is done).
- `list_captures`, `get_design_checks`, `propose_capture_rule`: saved design captures and design checks.

## Updating

With `npx -y @luci-dev/mcp@latest`, restart your agent and it starts the newest version. See [@luci-dev/cli](https://www.npmjs.com/package/@luci-dev/cli#updating) for updating the rest of Luci.

MIT licensed. Runs on your machine over stdio: no telemetry, no account.
