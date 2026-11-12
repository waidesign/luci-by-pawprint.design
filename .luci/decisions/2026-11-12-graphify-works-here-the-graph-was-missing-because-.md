# Graphify works here; the graph was missing because it was built before any code existed

- Date: 2026-11-12
- Status: accepted
- Area: Code map

## What
Graphify works here; the graph was missing because it was built before any code existed

## Why
2026-11-12. Graphify 0.9.104 is installed with uv (its own Python 3.12; the system python is only the Microsoft Store stub) and the prototype finds it. The first build ran at 16:18 during setup, when the repo held only Markdown and JSON, so code-only extraction produced a cache but no graph.json, and nothing rebuilt it after code was added. Rebuilt with `graphify extract . --code-only` and `graphify cluster-only . --no-label` (local AST only, no LLM calls): 397 nodes, 1014 edges, 13 communities, GRAPH_REPORT.md and graph.html. graphify-out/ is now git-ignored as generated output, as in the prototype. Refresh after code changes with `graphify update .`; automatic refresh through `graphify hook install` was not set up because installing git hooks needs the user's approval. For B6 (M3): the prototype calls an existing graph 'current' whenever graph.json exists, even when the code changed; Luci's code map should compare the report's 'Built from commit' with HEAD and say when the graph is stale.

## Alternatives considered
_Not recorded._
