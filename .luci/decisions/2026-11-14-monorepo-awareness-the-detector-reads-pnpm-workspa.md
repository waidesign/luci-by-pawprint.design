# Monorepo awareness: the detector reads pnpm-workspace.yaml or package.json workspaces (patterns dir/*, dir/**, folders, !exclusions; at most 60 packages) and detects each package on its own: kind (app, library, cli, mcp-server, server, browser-extension) and framework (new: preact, browser-extension). The project framework becomes monorepo unless the root is an app; hasUi, isReact, uiLibraries, testing and dependencies are unions over all packages. Shown in the Stack section of context.md (one line per package), brain.json project.packages (optional), get_project_context, init output, and the agent files framework line.

- Date: 2026-11-14
- Status: accepted
- Area: brain

## What
Monorepo awareness: the detector reads pnpm-workspace.yaml or package.json workspaces (patterns dir/*, dir/**, folders, !exclusions; at most 60 packages) and detects each package on its own: kind (app, library, cli, mcp-server, server, browser-extension) and framework (new: preact, browser-extension). The project framework becomes monorepo unless the root is an app; hasUi, isReact, uiLibraries, testing and dependencies are unions over all packages. Shown in the Stack section of context.md (one line per package), brain.json project.packages (optional), get_project_context, init output, and the agent files framework line.

## Why
User asked for the recommendation after learning Luci is a monorepo, not a React app (2026-11-14). With only the root package.json, a monorepo looked like plain node: no UI packs, no stack per package, deps for skill matching incomplete.

## Alternatives considered
_Not recorded._
