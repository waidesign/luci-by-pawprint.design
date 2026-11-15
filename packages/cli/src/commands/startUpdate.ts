import { PRODUCT } from '@luci/format';
import { generatedFiles, startProject, updateProject } from '@luci/brain';
import type { Command } from '../context.js';
import { cliVersion } from '../version.js';

export const START_HELP = `start                 Resume this project: the active task and the context an agent needs`;
export const UPDATE_HELP = `update                Refresh auto-detected sections, brain.json, agent files and the skill catalog`;

const notInitialized = (ctx: Parameters<Command>[1]) => {
  ctx.err(`No ${PRODUCT.projectDir}/ here. Run \`${PRODUCT.command} init\` first.`);
  return 1;
};

export const startCommand: Command = async (_args, ctx) => {
  const report = await startProject(ctx.cwd);
  if (!report.initialized || !report.diagnosis) return notInitialized(ctx);
  const p = report.diagnosis.project;
  const header = report.activePackage
    ? `${PRODUCT.name} start: ${report.projectPath} (package: ${report.activePackage.path})`
    : `${PRODUCT.name} start: ${report.projectPath}`;
  ctx.out(header);
  if (report.activePackage) {
    ctx.out(`Package:      ${report.activePackage.path} (${report.activePackage.name}) — ${report.activePackage.kind}, ${report.activePackage.framework}`);
    if (report.activePackage.rules?.length) {
      ctx.out(`Package rules (${report.activePackage.rules.length}):`);
      for (const r of report.activePackage.rules) {
        ctx.out(`  - ${r}`);
      }
    }
  } else if (report.packages?.length) {
    ctx.out(`Packages (${report.packages.length}):`);
    for (const pkg of report.packages) {
      const ruleCount = pkg.rules?.length ?? 0;
      ctx.out(`  - ${pkg.path} (${pkg.name}) — ${pkg.kind}, ${pkg.framework}${ruleCount ? ` (${ruleCount} rule${ruleCount === 1 ? '' : 's'})` : ''}`);
    }
  }
  if (p) {
    ctx.out(`\nActive task:  ${p.activeTask ? `${p.activeTask.task ?? '(no title)'}${p.activeTask.started ? ` (since ${p.activeTask.started})` : ''}` : '(none)'}`);
    ctx.out(`Goal:         ${p.goal ? p.goal.split('\n')[0] : '(not written yet)'}`);
    ctx.out(`Own rules:    ${p.projectRules}`);
    ctx.out(`Skills:       ${p.skills}`);
    ctx.out(`Proposals:    ${p.pendingProposals} waiting for review`);
    ctx.out(`Code map:     ${p.hasCodeMap ? 'graphify-out/graph.json' : '(not built)'}`);
  }
  const problems = report.diagnosis.checks.filter(c => c.status === 'fail' || c.status === 'warn');
  if (problems.length) {
    ctx.out('\nTo look at:');
    for (const c of problems) ctx.out(`  [${c.status}] ${c.label}${c.detail ? `: ${c.detail}` : ''}${c.fix ? `\n         Fix: ${c.fix}` : ''}`);
  }
  ctx.out(`\nRefreshed ${PRODUCT.projectDir}/local/global-brain.md from your Global Brain.`);
  ctx.out(p?.activeTask
    ? `Next: continue the active task; when it is finished run \`${PRODUCT.command} task done\`.`
    : `Next: start a task with \`${PRODUCT.command} skills use "<task>" --inject\`, or just describe it to your agent.`);
  return report.diagnosis.ok ? 0 : 1;
};

export const updateCommand: Command = async (_args, ctx) => {
  const report = await updateProject(ctx.cwd, { version: cliVersion() });
  if (!report.initialized) return notInitialized(ctx);
  ctx.out(`${PRODUCT.name} update: ${report.projectPath}`);
  if (report.added.length) ctx.out(`Added missing files: ${report.added.join(', ')}`);
  ctx.out(report.refreshedSections.length ? `Refreshed: ${report.refreshedSections.join(', ')}` : 'Auto-detected sections are current.');
  if (report.agentFiles.length) ctx.out(`Refreshed the ${PRODUCT.name} section in: ${report.agentFiles.join(', ')}`);
  if (report.oldSectionsRemoved.length) ctx.out(`Removed the old section from before the import (it pointed to a memory folder that is gone) from: ${report.oldSectionsRemoved.join(', ')}`);
  ctx.out(`Rewrote generated files: ${generatedFiles().join(', ')}`);
  if (report.codeMap) ctx.out(`Code map: ${report.codeMap}`);
  ctx.out(`Everything you wrote was kept. Rename a section to "(confirmed)" to stop it being refreshed.`);
  return 0;
};
