# Feedback is manual: the person marks notes done. Statuses shown are New, Copied and Done (pending, sent, resolved; older acknowledged/question/dismissed are read as copied/copied/done). The toolbar has Mark done, Reopen, Mark all copied as done and Clear done; it no longer polls. luci-mcp keeps only read-only list_feedback and get_feedback_prompt (which no longer marks notes sent); acknowledge, ask, resolve, dismiss and clear tools were removed. The prompt no longer mentions MCP tools.

- Date: 2026-11-13
- Status: accepted
- Area: feedback

## What
Feedback is manual: the person marks notes done. Statuses shown are New, Copied and Done (pending, sent, resolved; older acknowledged/question/dismissed are read as copied/copied/done). The toolbar has Mark done, Reopen, Mark all copied as done and Clear done; it no longer polls. luci-mcp keeps only read-only list_feedback and get_feedback_prompt (which no longer marks notes sent); acknowledge, ask, resolve, dismiss and clear tools were removed. The prompt no longer mentions MCP tools.

## Why
User, 2026-11-13: notes the agent fixed could not be cleared because the agent never reported to Luci; "just give ability to user to give annotation and let them copy and paste it manually ... more safe than the automation". Said "Do it with best decisions". PRD FR30 and the Agentation checklist updated.

## Alternatives considered
_Not recorded._
