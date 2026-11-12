# Luci Skill Standard (LSS) v1

A Luci skill is an [Agent Skills](https://agentskills.io) folder plus one contract file. Any agent that reads `SKILL.md` can use it as it is; Luci reads `luci.json` on top for ranking, trust and licences. The schemas are in `packages/format/src/skills/`.

```
<name>/
  SKILL.md        Agent Skills frontmatter + instructions (the body agents load)
  luci.json       the contract: what Luci ranks and checks
  references/     optional: long parts agents open only when needed
  scripts/        optional: makes the skill able to run commands ("shell" permission)
  NOTICE.md       third-party skills: where it comes from and its licence
  LICENSE.txt     when the licence asks for its text to travel with the skill
```

## SKILL.md

Only the Agent Skills fields are allowed in the frontmatter: `name` (lowercase, digits and single hyphens, the same as the folder), `description` (what the skill does and when to use it, at most 1024 characters), `license`, `compatibility`, `allowed-tools` and `metadata`. Luci's own data goes in `metadata` as strings:

| Key | Meaning |
| --- | --- |
| `luci-title` | Display name, when it differs from `name` |
| `luci-category` | Library category; matches the parent folder in the library |
| `luci-author` | Who wrote it |
| `luci-version` | The skill's version |
| `luci-tags` | Comma-separated search terms (at most 15) |

Bodies stay under about 5,000 tokens (500 for project skills in `.luci/skills/`); longer skills are split into `references/` without changing their content, and only when the licence allows changes.

## luci.json

| Field | Type | Meaning |
| --- | --- | --- |
| `lss` | number | Standard version (1) |
| `summary` | string | One or two sentences agents see in catalogs |
| `keywords` | string[] | Synonyms people type for this job (at most 20, 40 characters each) |
| `whenToUse`, `whenNotToUse` | string[] | When it fits; when it must not be suggested |
| `verification` | string[] | Checks that show the work is done |
| `domains` | string[] | Broad areas (design, web, software, ...) |
| `frameworks`, `packages` | string[] | Stacks it is for; packages that mean it is installed |
| `exclusiveGroup` | string | Skills that do the same job (one per task, the installed one wins) |
| `dependsOn`, `related` | string[] | Other skills by name |
| `permissions` | string[] | `shell`, `network`, `filesystem`, `secrets` |
| `source` | object | `repo`, `path`, `licenseStatus` (open, copyleft, restricted, unknown), `licenseEvidence`, `licenseUrl`, `licenseCheckedAt`, `copyright` |
| `derived` | string[] | Fields Luci filled from the skill's own text (refreshable) |
| `drafts` | string[] | AI-drafted fields waiting for a person; ignored for ranking until approved |
| `extraFrontmatter` | object | Fields from the original that the standard has no place for, kept verbatim |

## Ranking

Luci matches a task against a skill's name, tags, keywords, category and description, weighs rare words more, and loads a skill only when it covers enough of the task. Nothing loads when nothing fits. `whenNotToUse` keeps a skill out of matching tasks; pinned skills get a small boost only when they already fit; blocked skills are never suggested. Levels: Incomplete (does not say when to use it), Findable, Rankable (summary, whenToUse, domains, 3+ search terms), Precise (+ whenNotToUse, verification).

## Trust and licences

Every skill shows where it comes from: `official` (Luci's library), `community` (from someone's GitHub repository, not reviewed), `personal` (your own), or `project` (in `.luci/skills/`). A skill can never declare itself verified. A licence counts only with evidence, most specific first: a licence file in the skill's folder, the `license` field of the original SKILL.md, then the repository's licence; a README statement is not enough. Luci's library ships only skills with an open licence on record, and each third-party skill keeps its notice.
