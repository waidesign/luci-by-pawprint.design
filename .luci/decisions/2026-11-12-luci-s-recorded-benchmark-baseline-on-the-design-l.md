# Luci's recorded benchmark baseline on the design library

- Date: 2026-11-12
- Status: accepted
- Area: Skills

## What
Luci's recorded benchmark baseline on the design library

## Why
2026-11-12, 38 skills. Cases re-scoped as decided: a case stays in scope when one of its acceptable skills ships (14 tuning, 5 held-out); the rest expect no skill, with a note; labels for skills Luci does not ship were removed (scores unchanged). Results, both systems: tuning hit rate 0.929, precision 0.81, no-match accuracy 0.864; held-out hit rate 0.8, precision 0.7, no-match accuracy 0.941. Misses: ui-react-rerenders and ho-vue-vitest find nothing (common words like 'react' weigh less in a small library); out-of-scope tasks 'Create a Word document report' and 'Deploy a Next.js site to Vercel' pick unrelated skills; ho-design-doc picks component-docs. 184 prototype skills carry AI-drafted keywords that ranking ignores until a person approves them (S10): reviewing those for the 38 design skills is the main lever to raise these numbers, and is the user's call. The benchmark runs in the test suite and fails when a score drops below eval/baseline.json.

## Alternatives considered
_Not recorded._
