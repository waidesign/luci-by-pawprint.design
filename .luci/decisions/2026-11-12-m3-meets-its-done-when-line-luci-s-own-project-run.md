# M3 meets its Done-when line: Luci's own project runs on Luci, and an agent resumes the active task without being briefed

- Date: 2026-11-12
- Status: accepted
- Area: Milestone

## What
M3 meets its Done-when line: Luci's own project runs on Luci, and an agent resumes the active task without being briefed

## Why
luci import moved ai-brain/ onto .luci/ here (goal and 11 project rules kept, 31 history files copied, starters replaced by Luci's copies, agent files rewritten); luci doctor shows no failures and one warning (4 prototype-era library skills not in Luci's library). A fresh MCP client against luci-mcp got the goal, rules, active task and its checklist with no briefing, and luci start shows the same. The old ai-brain/ folder is kept until the user agrees to delete it; the user still confirms resuming in a real new session, as with the M1 Cursor check.

## Alternatives considered
_Not recorded._
