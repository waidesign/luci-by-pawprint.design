# Recording a project decision without .luci/ is an error

- Date: 2026-11-12
- Status: accepted
- Area: Memory

## What
Recording a project decision without .luci/ is an error

## Why
The prototype's recordDecision wrote nothing when the project had no decisions folder, and its update_project_memory MCP tool still answered 'Recorded the decision'. Luci's MemoryEngine.recordProjectDecision throws with the fix (run luci init), so a decision is never lost silently. The MCP server (M3) must report that error.

## Alternatives considered
_Not recorded._
