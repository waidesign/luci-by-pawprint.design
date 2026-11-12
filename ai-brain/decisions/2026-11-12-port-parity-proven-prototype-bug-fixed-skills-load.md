# Port parity proven; prototype bug fixed: skills loaded with empty instructions

- Date: 2026-11-12
- Status: accepted
- Area: Skills

## What
Port parity proven; prototype bug fixed: skills loaded with empty instructions

## Why
2026-11-12. scripts/parity.mjs converts the prototype's 212-skill library to the Luci Skill Standard in a temporary folder and runs the original 58 cases through Luci's TypeScript engine: hit rate, precision, no-match accuracy and average skills match the prototype baseline exactly in both sets and both systems (tuning 0.966, held-out 0.941). Token averages differ for a reason found on the way: the prototype's discovery copied skills with drafted keywords using an object spread, which drops the lazily loaded skill body, so in `gaw use`, load_skills and load_project_skills 56 of the 88 skills loaded across the benchmark tasks reached agents with an EMPTY body (header and reason only). 184 of 212 library skills have drafted keywords. Luci returns the original skill objects, so agents get the full instructions, still within the 8,000-token budget. Token averages are therefore not compared with the prototype baseline.

## Alternatives considered
_Not recorded._
