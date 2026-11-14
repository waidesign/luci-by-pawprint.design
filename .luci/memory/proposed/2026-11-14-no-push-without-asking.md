# Push only when the user says so

- What happened: on 2026-11-14 the user asked that agents never push to GitHub unless they say so; committing locally is fine.
- Proposed: in `rules.md` → Project-Specific Rules, replace "Commit locally after each finished task; never push." with:
  - Commit locally after each finished task. Never push to GitHub or any remote (including force-pushes, tag pushes and opening PRs) unless the user says to; one approval covers that one push only.
- Belongs in: rules.md
