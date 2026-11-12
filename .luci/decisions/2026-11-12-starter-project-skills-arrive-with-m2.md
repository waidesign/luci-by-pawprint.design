# Starter project skills arrive with M2

- Date: 2026-11-12
- Status: accepted
- Area: Architecture

## What
Starter project skills arrive with M2

## Why
The prototype's init copied five starter skills (code-review, debugging, implement-feature, security-basics, testing) into the project. They are skill folders with a skill contract (gaw.json, renamed luci.json), and both the Luci Skill Standard and the skill linter that checks them belong to the skills package in M2. M1 init writes the memory layout only; M2 adds the starter skills, skills/, skills.lock.json and project-skills.md, and puts the skills lines back into the README and playbook templates.

## Alternatives considered
_Not recorded._
