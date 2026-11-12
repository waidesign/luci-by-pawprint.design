# .luci: luci-monorepo

This folder tells AI coding agents how to work on this project. It was set up by Luci. Everything is plain text: read it, edit it, and review changes to it like code.

## What's here
| Path | What it is | In git? |
|---|---|---|
| `context.md` | Goal, stack, commands, folder map, conventions, definition of done | Yes |
| `rules.md` | Short rules agents follow in every session | Yes |
| `playbook.md` | Step-by-step recipes per kind of task | Yes |
| `decisions/` | Short records of decisions and why they were made | Yes |
| `memory/proposed/` | Lessons agents suggest; a person moves them into the files above or deletes them | Yes |
| `skills/`, `skills.lock.json`, `project-skills.md` | Skills for this project; agents open one only when a task needs it | Yes |
| `brain.json` | Settings Luci reads: layout version, detected stack, precedence | Yes |
| `local/` | Your current task and a summary of your personal preferences | No (ignored by its own `.gitignore`) |

Sections marked **(auto-detected)** are refreshed by `luci update`. Change the heading to **(confirmed)** to keep your own version. Everything else is yours and is never overwritten.

## Never store secrets here
No API keys, passwords, tokens or customer data. These files are committed and read by AI tools.

## Updating
Run `luci update` to refresh the auto-detected sections, `brain.json`, the agent instruction files and the skill catalog. Teammates without Luci can still use every file here; nothing requires it.

## Removing
Delete this folder, and the section between the `LUCI` markers in `CLAUDE.md` and `.cursorrules`. Nothing else depends on it.
