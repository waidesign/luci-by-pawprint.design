# M3.3 (B11): luci-mcp is a new package @luci/mcp on @modelcontextprotocol/sdk 1.32.2 (pinned), stdio, McpServer.registerTool with Zod 4 input shapes

- Date: 2026-11-12
- Status: accepted
- Area: Architecture

## What
M3.3 (B11): luci-mcp is a new package @luci/mcp on @modelcontextprotocol/sdk 1.32.2 (pinned), stdio, McpServer.registerTool with Zod 4 input shapes

## Why
Ported 17 prototype tools (presets, agentation and get_project_graph dropped; the graph tool waits for B6) and added get_active_task and propose_memory. Tools that write refuse to run without .luci/ and never create it (only initialize_project does); update_project_memory returns an error with the fix instead of "Recorded". Every tool has MCP annotations (read-only or write). loadProjectContext moved into brain and the doctor now shares its goal and rules readers. The agent block has the MCP line again. Tests call handleTool directly plus one stdio round trip with the SDK client.

## Alternatives considered
_Not recorded._
