# Licence check of the 17 unverified design skills

- Date: 2026-11-12
- Status: accepted
- Area: Skills

## What
Licence check of the 17 unverified design skills

## Why
Checked 2026-11-12 at the original public sources. Accepted evidence, as in the prototype's licence resolver: a LICENSE file in the skill folder, then the license field of the original SKILL.md, then the repository LICENSE; a README statement alone is not enough.

Ship (verified open):
- frontend-design: anthropics/skills skills/frontend-design, Apache-2.0 (LICENSE.txt in the skill folder).
- react-best-practices: vercel-labs/agent-skills skills/react-best-practices, MIT (license: MIT in the original SKILL.md).
- tailwindcss, animation-systems, threejs, landing-page, pricing-page, masked-reveal, animation-on-scroll, company-logos, container-lines: MengTo/Skills agent-skills/web-design/<name>, MIT (repository LICENSE, Copyright (c) 2026 Meng To).
- accessibility-baseline: the user's own, MIT (confirmed by the user).

Stay out:
- design-lab (0xdesign/design-plugin): MIT stated only in the README, no LICENSE file.
- web-design-guidelines (vercel-labs/agent-skills): no LICENSE file and no license field; README only.
- rams (rams.ai/rams.md): no licence statement.
- motion-dev, animejs: no public source found; may be the prototype author's own, to be confirmed by the user.

Each shipped third-party skill keeps its copyright notice and licence text in its folder, and its source and evidence in luci.json.

## Alternatives considered
_Not recorded._
