import { PRODUCT } from '@luci/format';
import { archiveActiveTask, readActiveTask } from '@luci/brain';
import type { Command } from '../context.js';

export const TASK_HELP = `task [done]           Show the active task, or archive it when it is finished`;

export const taskCommand: Command = async (args, ctx) => {
  const sub = args[0];
  if (sub === 'done' || sub === 'archive') {
    const archived = archiveActiveTask(ctx.cwd, 'done');
    ctx.out(archived ? `Task archived to ${archived}. Agents no longer read it.` : 'No active task to archive.');
    return 0;
  }
  if (sub) {
    ctx.err(`Unknown task command: ${sub}\nUsage: ${PRODUCT.command} ${TASK_HELP}`);
    return 1;
  }
  const task = readActiveTask(ctx.cwd);
  if (!task) {
    ctx.out(`No active task. Start one with: ${PRODUCT.command} skills use "<task>" --inject`);
    return 0;
  }
  ctx.out(`Task:    ${task.task ?? '(no title)'}`);
  ctx.out(`Status:  ${task.status}${task.status === 'active' ? '' : ' (agents ignore it)'}`);
  ctx.out(`Started: ${task.started ?? 'unknown'}`);
  ctx.out(`File:    ${task.file}`);
  ctx.out(`\nWhen it's finished: ${PRODUCT.command} task done`);
  return 0;
};
