# Luci Evaluations & Benchmark Harness

This document describes the reproducible evaluations in this repository and how to inspect saved results. In line with Luci's documentation policy, it includes only measured results backed by saved files in `eval/` and contains no competitor comparisons or unverified claims.

---

## 1. Skill Selection Baseline (`eval/baseline.json`)

The `@luci-dev/skills` package includes a deterministic benchmark suite that measures how accurately Luci selects relevant skills within the 8,000-token budget across a 38-skill library (largest skill: 4,832 tokens).

**Recorded baseline (`2026-11-12T11:24:58.677Z`):**

| Dataset | Cases | System | Hit Rate | Precision | No-Match Accuracy | Avg Skills | Avg Tokens | Score |
| :--- | :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Tuning** | 36 (14 covered, 22 no-match) | `onboarding` | 1.000 | 0.912 | 0.864 | 0.75 | 1,180 | 0.925 |
| **Tuning** | 36 (14 covered, 22 no-match) | `use` | 1.000 | 0.923 | 0.864 | 0.72 | 1,182 | 0.929 |
| **Held-out** | 22 (5 covered, 17 no-match) | `onboarding` | 0.800 | 0.700 | 0.941 | 0.32 | 577 | 0.814 |
| **Held-out** | 22 (5 covered, 17 no-match) | `use` | 0.800 | 0.700 | 0.941 | 0.32 | 579 | 0.814 |

**How to run and verify:**
```bash
node scripts/eval.mjs
pnpm test
```

---

## 2. Multi-Page Feedback Evaluation Harness (`scripts/eval-multipage.mjs`)

The repository provides an isolated multi-page evaluation script against the 3-route fixture app (`packages/feedback/fixtures/app`, testing 6 scoped feedback items `P1-A1` through `P3-A2` across `/`, `/pricing`, and `/checkout`).

- **Saved report path:** `eval/multi-page-report.json` (not populated until run locally with `--save-report`).
- **Status:** No saved multi-page run logs are committed in `eval/` yet; multi-page pass rates and timings are intentionally omitted until recorded runs with saved logs are checked in.

**How to run locally and save a report:**
```bash
pnpm test:multipage -- --save-report
```

---

## 3. Viewing Saved Reports via the CLI

When run inside a workspace containing saved files in `eval/`, the CLI reads and formats them directly:

```bash
luci benchmark
luci benchmark --json
```

- Reads `eval/baseline.json` and `eval/multi-page-report.json` if present.
- If no saved reports exist in `eval/`, exits cleanly without reporting synthetic metrics.
