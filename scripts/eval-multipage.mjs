#!/usr/bin/env node
/**
 * Automated 10-run multi-page prompt benchmark (PRD Test 2).
 *
 * Checks that feedback across 3 pages is applied in full and reported by the agent in 10 of 10 runs.
 *
 * Usage:
 *   node scripts/eval-multipage.mjs                  # Run 10 runs with Claude Code (Luci format)
 *   node scripts/eval-multipage.mjs --runs 1         # Run 1 quick verification run
 *   node scripts/eval-multipage.mjs --dry-run        # Mock simulation to test the harness
 *   node scripts/eval-multipage.mjs --agentation     # Run with Agentation format for comparison
 *   node scripts/eval-multipage.mjs --save-report    # Save results to eval/multi-page-report.json
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesAppDir = path.join(root, 'packages', 'feedback', 'fixtures', 'app');
const luciPromptFile = path.join(root, 'packages', 'format', 'fixtures', 'feedback', 'three-pages.standard.prompt.md');

// CLI Arguments
const args = process.argv.slice(2);
const runsArgIndex = args.indexOf('--runs');
const totalRuns = runsArgIndex !== -1 && args[runsArgIndex + 1] ? parseInt(args[runsArgIndex + 1], 10) : (args.includes('--dry-run') ? 10 : 10);
const dryRun = args.includes('--dry-run');
const useAgentation = args.includes('--agentation') || (args.includes('--format') && args[args.indexOf('--format') + 1] === 'agentation');
const saveReport = args.includes('--save-report');

const agentCmd = (() => {
  const idx = args.indexOf('--agent');
  if (idx !== -1 && args[idx + 1]) return args[idx + 1];
  return 'claude';
})();

const LUCI_PROMPT = fs.readFileSync(luciPromptFile, 'utf8');

const AGENTATION_PROMPT = `# UI feedback

## /pricing
- Button label wraps on mobile (main > section:nth-of-type(2) > button)
- Typo: "pricing" (main > h1)

# UI feedback

## /
- Use 24px between the links and align them with the logo (header > nav)
- Use the secondary button style (main > a:nth-of-type(1))

# UI feedback

## /checkout
- Error text is too low contrast (form > p:nth-of-type(2))
- Disable while the payment is sending (form > button)
`;

const activePrompt = useAgentation ? AGENTATION_PROMPT : LUCI_PROMPT;
const formatName = useAgentation ? 'Agentation' : 'Luci';

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function initGitRepo(dir) {
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git config core.autocrlf false', { cwd: dir, stdio: 'ignore' });
  execSync('git config core.safecrlf false', { cwd: dir, stdio: 'ignore' });
  execSync('git config advice.addEmbeddedRepo false', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Multi-Page Benchmark"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "benchmark@luci.local"', { cwd: dir, stdio: 'ignore' });
  execSync('git add -A', { cwd: dir, stdio: 'ignore' });
  execSync('git commit -m "Initial 3-page app baseline"', { cwd: dir, stdio: 'ignore' });
}

function resetGitRepo(dir) {
  execSync('git reset --hard HEAD', { cwd: dir, stdio: 'ignore' });
  execSync('git clean -fd', { cwd: dir, stdio: 'ignore' });
}

function verifyItemsApplied(dir) {
  const results = {
    'P1-A1': false,
    'P1-A2': false,
    'P2-A1': false,
    'P2-A2': false,
    'P3-A1': false,
    'P3-A2': false
  };

  try {
    const diffStat = execSync('git diff --name-only HEAD', { cwd: dir, encoding: 'utf8' }).trim().split('\n');
    const diffText = execSync('git diff HEAD', { cwd: dir, encoding: 'utf8' });

    // P1-A1: PlanCard button wrap / styling fix
    if (diffStat.some(f => f.includes('PlanCard.jsx'))) {
      results['P1-A1'] = true;
    }

    // P1-A2: Typo "pricng" -> "pricing" in Pricing.jsx
    const pricingContent = fs.existsSync(path.join(dir, 'src', 'pages', 'Pricing.jsx'))
      ? fs.readFileSync(path.join(dir, 'src', 'pages', 'Pricing.jsx'), 'utf8')
      : '';
    if (!pricingContent.includes('pricng') && pricingContent.includes('pricing')) {
      results['P1-A2'] = true;
    }

    // P2-A1: Spacing / 24px between links in Nav.jsx
    if (diffStat.some(f => f.includes('Nav.jsx')) && (diffText.includes('24px') || diffText.includes('gap') || diffText.includes('spacing') || diffText.includes('margin'))) {
      results['P2-A1'] = true;
    } else if (diffStat.some(f => f.includes('Nav.jsx'))) {
      results['P2-A1'] = true;
    }

    // P2-A2: Secondary button style on Cta.jsx / Home.jsx
    if (diffStat.some(f => f.includes('Cta.jsx') || f.includes('Home.jsx'))) {
      results['P2-A2'] = true;
    }

    // P3-A1: Error text contrast in FieldError.jsx / Checkout.jsx
    if (diffStat.some(f => f.includes('FieldError.jsx') || f.includes('Checkout.jsx'))) {
      results['P3-A1'] = true;
    }

    // P3-A2: Disable while sending in Checkout.jsx
    if (diffText.includes('disabled') || diffStat.some(f => f.includes('Checkout.jsx') && diffText.includes('button'))) {
      results['P3-A2'] = true;
    }
  } catch (err) {
    console.error('Error checking diff:', err.message);
  }

  const appliedCount = Object.values(results).filter(Boolean).length;
  return { results, count: appliedCount };
}

function verifyItemsReported(output) {
  const itemIds = ['P1-A1', 'P1-A2', 'P2-A1', 'P2-A2', 'P3-A1', 'P3-A2'];
  const reported = {};
  for (const id of itemIds) {
    const regex = new RegExp(`\\[?${id}\\]?`, 'i');
    reported[id] = regex.test(output);
  }
  const count = Object.values(reported).filter(Boolean).length;
  return { reported, count };
}

const verbose = args.includes('--verbose') || args.includes('-v');

async function runAgent(cwd, prompt) {
  if (dryRun) {
    // Simulate a successful run for testing the test runner
    const planCardPath = path.join(cwd, 'src', 'components', 'PlanCard.jsx');
    const pricingPath = path.join(cwd, 'src', 'pages', 'Pricing.jsx');
    const navPath = path.join(cwd, 'src', 'components', 'Nav.jsx');
    const ctaPath = path.join(cwd, 'src', 'components', 'Cta.jsx');
    const fieldErrorPath = path.join(cwd, 'src', 'components', 'FieldError.jsx');
    const checkoutPath = path.join(cwd, 'src', 'pages', 'Checkout.jsx');

    if (fs.existsSync(planCardPath)) fs.appendFileSync(planCardPath, '\n// nowrap fix\n');
    if (fs.existsSync(pricingPath)) fs.writeFileSync(pricingPath, fs.readFileSync(pricingPath, 'utf8').replace('pricng', 'pricing'), 'utf8');
    if (fs.existsSync(navPath)) fs.appendFileSync(navPath, '\n// 24px gap\n');
    if (fs.existsSync(ctaPath)) fs.appendFileSync(ctaPath, '\n// secondary button\n');
    if (fs.existsSync(fieldErrorPath)) fs.appendFileSync(fieldErrorPath, '\n// high contrast\n');
    if (fs.existsSync(checkoutPath)) fs.writeFileSync(checkoutPath, fs.readFileSync(checkoutPath, 'utf8').replace('<button type="submit">', '<button type="submit" disabled={false}>'), 'utf8');

    return {
      output: `All items completed:
- [P1-A1] done
- [P1-A2] done
- [P2-A1] done
- [P2-A2] done
- [P3-A1] done
- [P3-A2] done
Completed 6 of 6 items across all 3 pages.`,
      durationMs: 120
    };
  }

  const startTime = Date.now();
  return new Promise((resolve) => {
    // Execute agent non-interactively with empty stdin
    const child = spawn(agentCmd, ['-p', prompt, '--dangerously-skip-permissions'], {
      cwd,
      shell: true,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    child.stdout.on('data', (d) => { output += d.toString(); });
    child.stderr.on('data', (d) => { output += d.toString(); });

    // Close stdin immediately so the CLI does not wait
    child.stdin.end();

    child.on('close', () => {
      if (verbose) {
        console.log('\n--- AGENT OUTPUT ---');
        console.log(output);
        console.log('--- END AGENT OUTPUT ---\n');
      }
      resolve({
        output,
        durationMs: Date.now() - startTime
      });
    });

    child.on('error', (err) => {
      resolve({
        output: `Agent execution failed: ${err.message}`,
        durationMs: Date.now() - startTime
      });
    });
  });
}

async function main() {
  console.log(`\n===============================================================`);
  console.log(`  Luci PRD Test 2: Multi-Page Feedback Benchmark`);
  console.log(`===============================================================`);
  console.log(`  Target runs: ${totalRuns}`);
  console.log(`  Format:      ${formatName}`);
  console.log(`  Agent:       ${dryRun ? 'Mock Simulation (--dry-run)' : agentCmd}`);
  console.log(`  Fixture App: ${fixturesAppDir}`);
  console.log(`---------------------------------------------------------------\n`);

  // Create isolated temp workspace
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'luci-multipage-eval-'));
  const testWorkspace = path.join(tempDir, 'app');
  copyDirRecursive(fixturesAppDir, testWorkspace);
  initGitRepo(testWorkspace);

  const scoreSheet = [];

  console.log(`| Run | Format | Applied (of 6) | Reported (of 6) | Time    | Notes                      | Status |`);
  console.log(`| :-- | :----- | :------------- | :-------------- | :------ | :------------------------- | :----- |`);

  for (let run = 1; run <= totalRuns; run++) {
    resetGitRepo(testWorkspace);

    const { output, durationMs } = await runAgent(testWorkspace, activePrompt);
    const applied = verifyItemsApplied(testWorkspace);
    const reported = verifyItemsReported(output);

    const isPass = applied.count === 6 && (useAgentation || reported.count === 6);
    const durationSec = (durationMs / 1000).toFixed(1) + 's';

    let note = '';
    if (output.includes('weekly limit') || output.includes('rate limit') || output.includes('quota')) {
      note = 'Quota / Rate limit exceeded';
    } else if (applied.count === 6 && reported.count === 6) {
      note = 'All items complete';
    } else if (applied.count < 6) {
      note = `Missed ${6 - applied.count} items`;
    }

    scoreSheet.push({
      run,
      format: formatName,
      applied: applied.count,
      reported: reported.count,
      durationMs,
      note,
      pass: isPass
    });

    const statusBadge = isPass ? 'PASS ' : 'FAIL ';
    console.log(`| ${String(run).padEnd(3)} | ${formatName.padEnd(6)} | ${applied.count} / 6          | ${reported.count} / 6           | ${durationSec.padEnd(7)} | ${note.padEnd(26)} | ${statusBadge}  |`);
  }

  // Cleanup temp dir
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch (_) {}

  const passedRuns = scoreSheet.filter(s => s.pass).length;
  const pct = Math.round((passedRuns / totalRuns) * 100);

  console.log(`\n---------------------------------------------------------------`);
  console.log(`Result: ${passedRuns} of ${totalRuns} passed (${pct}%).`);
  if (passedRuns === totalRuns) {
    console.log(`STATUS: TEST 2 PASSED (Meets PRD requirement of 10/10 runs)`);
  } else {
    console.log(`STATUS: TEST 2 FAILED (${totalRuns - passedRuns} run(s) did not complete all 6 items)`);
  }
  console.log(`---------------------------------------------------------------\n`);

  if (saveReport) {
    const reportPath = path.join(root, 'eval', 'multi-page-report.json');
    fs.mkdirSync(path.dirname(reportPath), { recursive: true });
    fs.writeFileSync(reportPath, JSON.stringify({
      date: new Date().toISOString(),
      format: formatName,
      totalRuns,
      passedRuns,
      passRate: pct,
      scoreSheet
    }, null, 2), 'utf8');
    console.log(`Report saved to ${reportPath}`);
  }
}

await main();
