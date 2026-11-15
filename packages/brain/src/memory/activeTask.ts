/**
 * The current task (B9): .luci/local/active-task.md. A small pointer file (task, status,
 * which skill files to open and why, what was left out, acceptance criteria). It lives in
 * local/, so it is never committed, and it is archived when the task is done or replaced,
 * so a stale task can't mislead a later session.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MEMORY_FILES, parseActiveTaskHeader, type TaskStatus } from '@luci/format';
import { ensureLocalDir, findProjectRoot, memoryDir, memoryPath } from '../layout/brainLayout.js';

export interface ActiveTask {
  /** Project-relative path, e.g. ".luci/local/active-task.md". */
  file: string;
  task: string | null;
  status: TaskStatus | 'unreadable';
  started: string | null;
}

const activePath = (projectDir: string) => path.join(memoryDir(findProjectRoot(projectDir).root), MEMORY_FILES.activeTask);
const slug = (text: string | null) => String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'task';

/** The current task, or null when there is none. A header Luci can't read is reported, not thrown. */
export function readActiveTask(projectDir: string): ActiveTask | null {
  const root = findProjectRoot(projectDir).root;
  const file = activePath(root);
  if (!fs.existsSync(file)) return null;
  const header = parseActiveTaskHeader(fs.readFileSync(file, 'utf8'));
  const rel = memoryPath(MEMORY_FILES.activeTask);
  return header.ok
    ? { file: rel, ...header.value }
    : { file: rel, task: null, status: 'unreadable', started: null };
}

/** Move the current task to local/archive/ with a final status. Returns the archive path, or null. */
export function archiveActiveTask(projectDir: string, status: 'done' | 'replaced' = 'done'): string | null {
  const root = findProjectRoot(projectDir).root;
  const file = activePath(root);
  if (!fs.existsSync(file)) return null;
  const current = readActiveTask(root);
  const today = new Date().toISOString().slice(0, 10);
  const text = fs.readFileSync(file, 'utf8').replace(/^- \*\*Status\*\*: .+$/m, `- **Status**: ${status} (${today})`);
  const archiveDir = path.join(memoryDir(root), MEMORY_FILES.taskArchive);
  fs.mkdirSync(archiveDir, { recursive: true });
  let dest = path.join(archiveDir, `${current?.started ?? 'undated'}-${slug(current?.task ?? null)}.md`);
  for (let n = 2; fs.existsSync(dest); n++) dest = dest.replace(/(-\d+)?\.md$/, `-${n}.md`);
  fs.writeFileSync(dest, text, 'utf8');
  fs.unlinkSync(file);
  return path.relative(root, dest).replace(/\\/g, '/');
}

/** Write a new active task. An existing one is archived as "replaced" first. */
export function writeActiveTask(projectDir: string, markdown: string): { file: string; archived: string | null } {
  const root = findProjectRoot(projectDir).root;
  ensureLocalDir(root);
  const archived = archiveActiveTask(root, 'replaced');
  fs.writeFileSync(activePath(root), markdown, 'utf8');
  return { file: memoryPath(MEMORY_FILES.activeTask), archived };
}
