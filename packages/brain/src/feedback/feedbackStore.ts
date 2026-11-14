/**
 * Feedback items in .luci/feedback/, one JSON file per item (docs/format/feedback.md). Two programs
 * write here, `luci serve` (the toolbar) and `luci-mcp` (the agent), so every write replaces one
 * item's file in a single step (write a temporary file, then rename), and nothing is cached: each
 * call reads the files as they are now. The store never creates .luci/ itself.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { MEMORY_FILES, PRODUCT } from '@luci/format';
import {
  OPEN_STATUSES,
  byRef,
  feedbackItemSchema,
  nextRef,
  routeOf,
  type FeedbackIntent,
  type FeedbackItem,
  type FeedbackPriority,
  type FeedbackStatus,
  type DesignCheck,
  type LayoutPlan,
  type Wireframe
} from '@luci/format/feedback';
import { memoryDir } from '../layout/brainLayout.js';

/** What the toolbar sends for a new item; the store adds id, ref, status and times. */
export interface NewFeedback {
  page: { url: string; route?: string; title?: string; source?: string };
  target: FeedbackItem['target'];
  comment: string;
  intent: FeedbackIntent;
  priority: FeedbackPriority;
  /** A layout change planned in Layout mode. */
  layout?: LayoutPlan;
  /** A new page sketched in Layout mode. */
  wireframe?: Wireframe;
  /** A difference found by a design check. */
  check?: DesignCheck;
}

export class FeedbackError extends Error {}

const now = () => new Date().toISOString();

/** Write a file in one step: a reader sees the old file or the new one, never half of it. */
export function writeAtomic(file: string, text: string): void {
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    throw err;
  }
}

export class FeedbackStore {
  readonly dir: string;

  constructor(readonly projectDir: string) {
    this.dir = path.join(memoryDir(projectDir), MEMORY_FILES.feedback);
  }

  /** Whether the project has a memory folder to keep items in. */
  get available(): boolean {
    return fs.existsSync(memoryDir(this.projectDir));
  }

  private ensureDir(): void {
    if (!this.available) throw new FeedbackError(`No ${PRODUCT.projectDir}/ in ${this.projectDir}. Run \`${PRODUCT.command} init\` there first.`);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private file(id: string): string {
    return path.join(this.dir, `${id}.json`);
  }

  /** Every item, in prompt order. A file that is not a valid item is skipped and reported in `problems`. */
  read(): { items: FeedbackItem[]; problems: string[] } {
    if (!fs.existsSync(this.dir)) return { items: [], problems: [] };
    const items: FeedbackItem[] = [];
    const problems: string[] = [];
    for (const name of fs.readdirSync(this.dir).filter(n => n.endsWith('.json')).sort()) {
      try {
        const parsed = feedbackItemSchema.safeParse(JSON.parse(fs.readFileSync(path.join(this.dir, name), 'utf8')));
        if (parsed.success && `${parsed.data.id}.json` === name) items.push(parsed.data);
        else problems.push(`${name}: not a valid feedback item`);
      } catch (err) {
        // Deleted between listing and reading, or unreadable
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') problems.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return { items: byRef(items), problems };
  }

  list(filter: { status?: readonly FeedbackStatus[] } = {}): FeedbackItem[] {
    const { items } = this.read();
    return filter.status ? items.filter(i => filter.status!.includes(i.status)) : items;
  }

  /** Items an agent still has to act on (pending, sent, acknowledged, with a question). */
  open(): FeedbackItem[] {
    return this.list({ status: OPEN_STATUSES });
  }

  /** One item by its ref ("P2-A3") or id. */
  get(key: string): FeedbackItem | null {
    return this.list().find(i => i.ref === key || i.id === key) ?? null;
  }

  private write(item: FeedbackItem): FeedbackItem {
    const valid = feedbackItemSchema.parse(item);
    this.ensureDir();
    writeAtomic(this.file(valid.id), `${JSON.stringify(valid, null, 2)}\n`);
    return valid;
  }

  add(input: NewFeedback): FeedbackItem {
    this.ensureDir();
    const route = input.page.route ?? routeOf(input.page.url);
    const at = now();
    return this.write({
      id: crypto.randomBytes(8).toString('hex'),
      ref: nextRef(this.list(), route),
      page: { ...input.page, route },
      target: input.target,
      comment: input.comment,
      ...(input.layout ? { layout: input.layout } : {}),
      ...(input.wireframe ? { wireframe: input.wireframe } : {}),
      ...(input.check ? { check: input.check } : {}),
      intent: input.intent,
      priority: input.priority,
      status: 'pending',
      createdAt: at,
      updatedAt: at,
      thread: []
    });
  }

  /** Change one item; throws when there is no such item. */
  update(key: string, change: (item: FeedbackItem) => FeedbackItem): FeedbackItem {
    const item = this.get(key);
    if (!item) throw new FeedbackError(`No feedback item ${key}.`);
    return this.write({ ...change(item), id: item.id, ref: item.ref, updatedAt: now() });
  }

  /** The person edits their note (comment, intent, priority). */
  edit(key: string, patch: Partial<Pick<FeedbackItem, 'comment' | 'intent' | 'priority'>>): FeedbackItem {
    return this.update(key, i => ({ ...i, ...patch }));
  }

  /** Items put in a copied prompt (FR29). Items already further along keep their status. */
  markSent(keys: readonly string[]): FeedbackItem[] {
    const at = now();
    return keys.map(k => this.update(k, i => (i.status === 'pending' ? { ...i, status: 'sent', sentAt: at } : { ...i, sentAt: at })));
  }

  /** The person marks a note done (after checking the agent's work). */
  markDone(key: string): FeedbackItem {
    return this.update(key, i => ({ ...i, status: 'resolved' }));
  }

  /** Put an item back to pending (the person reopens it). */
  reopen(key: string): FeedbackItem {
    return this.update(key, ({ resolution: _r, ...i }) => ({ ...i, status: 'pending' }));
  }

  remove(key: string): boolean {
    const item = this.get(key);
    if (!item) return false;
    fs.rmSync(this.file(item.id), { force: true });
    return true;
  }

  /** Remove finished items (resolved and dismissed), or every item. Returns the refs removed. */
  clear(which: 'done' | 'all'): string[] {
    const gone = this.list().filter(i => which === 'all' || i.status === 'resolved' || i.status === 'dismissed');
    for (const i of gone) fs.rmSync(this.file(i.id), { force: true });
    return gone.map(i => i.ref);
  }
}
