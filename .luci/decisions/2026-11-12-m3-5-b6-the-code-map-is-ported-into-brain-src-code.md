# M3.5 (B6): the code map is ported into brain (src/codemap) with a git-based stale check, `luci map [--update|--full|--install [--yes]]` and the MCP tool get_project_graph

- Date: 2026-11-12
- Status: accepted
- Area: Architecture

## What
M3.5 (B6): the code map is ported into brain (src/codemap) with a git-based stale check, `luci map [--update|--full|--install [--yes]]` and the MCP tool get_project_graph

## Why
Ported GraphifyManager, GraphifyInstaller, toolLocator and ensureGraphify with their tests (commands now run with execFileSync, no shell). New: mapFreshness compares code files changed since Graphify's recorded built_at_commit (committed or not) with graph.json's time; without git it says unknown. Doctor shows it (info when missing, warn when stale), the project context carries it and warns agents, and `luci update` refreshes only an existing stale map; init and update never build a new map. Installing stays consent-gated: only `luci map --install` installs, the uv script is confirmed unless --yes, Enter means no, and with no terminal nothing is installed. The MCP tool never installs. Tried on this repo: stale with 14 files, then updated, then current.

## Alternatives considered
_Not recorded._
