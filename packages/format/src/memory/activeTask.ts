/**
 * The header of .luci/local/active-task.md: the fields Luci reads to decide whether
 * a task is current. The rest of the file is written by the task commands (M3).
 *
 *   - **Task**: <what is being done>
 *   - **Status**: active | done (YYYY-MM-DD) | replaced (YYYY-MM-DD)
 *   - **Started**: YYYY-MM-DD
 */
import { z } from 'zod';
import { fail, normalizeText, ok, type ParseResult } from '../result.js';

export const TASK_STATUSES = ['active', 'done', 'replaced'] as const;

export const activeTaskHeaderSchema = z.object({
  task: z.string().trim().min(1).nullable(),
  status: z.enum(TASK_STATUSES),
  started: z.iso.date().nullable()
});

export type ActiveTaskHeader = z.infer<typeof activeTaskHeaderSchema>;
export type TaskStatus = ActiveTaskHeader['status'];

function field(text: string, name: string): string | null {
  const m = new RegExp(`^- \\*\\*${name}\\*\\*: (.+)$`, 'm').exec(text);
  return m?.[1]?.trim() || null;
}

/** A missing Status means active, as in the prototype. Only the first word of Status counts. */
export function parseActiveTaskHeader(text: string): ParseResult<ActiveTaskHeader> {
  const content = normalizeText(text);
  const result = activeTaskHeaderSchema.safeParse({
    task: field(content, 'Task'),
    status: (field(content, 'Status') ?? 'active').split(/\s/)[0]?.toLowerCase(),
    started: field(content, 'Started')
  });
  if (!result.success) return fail(`active task header is not valid:\n${z.prettifyError(result.error)}`);
  return ok(result.data);
}
