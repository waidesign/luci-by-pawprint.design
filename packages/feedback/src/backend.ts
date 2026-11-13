/**
 * Where the toolbar keeps feedback items. With `luci serve` running, in the project (.luci/feedback/,
 * shared with the agent through luci-mcp); otherwise in this browser's storage for the app's address,
 * which still spans pages and reloads (FR26) and still gives the prompt to copy.
 */
import {
  OPEN_STATUSES,
  byRef,
  feedbackItemSchema,
  formatFeedbackPrompt,
  nextRef,
  routeOf,
  type DetailLevel,
  type FeedbackIntent,
  type FeedbackItem,
  type FeedbackPriority
} from '@luci/format/feedback';

export interface NewItem {
  page: { url: string; route?: string; title?: string; source?: string };
  target: FeedbackItem['target'];
  comment: string;
  intent: FeedbackIntent;
  priority: FeedbackPriority;
}

export type ItemChange =
  | { action: 'edit'; comment?: string; intent?: FeedbackIntent; priority?: FeedbackPriority }
  | { action: 'answer'; text: string }
  | { action: 'reopen' }
  | { action: 'resolve'; summary: string };

export interface PromptRequest {
  detail?: DetailLevel;
  /** Include items already sent (FR29: by default a copy holds only new items). */
  includeSent?: boolean;
}

export interface FeedbackBackend {
  /** "project": saved in .luci/ through luci serve, where the agent sees it; "browser": this browser only. */
  readonly kind: 'project' | 'browser';
  list(): Promise<FeedbackItem[]>;
  add(item: NewItem): Promise<FeedbackItem>;
  change(ref: string, change: ItemChange): Promise<FeedbackItem>;
  remove(ref: string): Promise<void>;
  /** The prompt for the items to send, which are then marked sent. */
  prompt(request: PromptRequest): Promise<{ prompt: string | null; refs: string[] }>;
  clear(which: 'done' | 'all'): Promise<string[]>;
  /** Save a capture file into .luci/design/ (project only). */
  saveCapture?(fileName: string, markdown: string): Promise<{ path: string; replaced: boolean }>;
}

export class BridgeError extends Error {}

/** The project, through `luci serve` at `url` ("http://127.0.0.1:4545"). */
export function bridgeBackend(url: string, fetchImpl: typeof fetch = (...a) => fetch(...a)): FeedbackBackend {
  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    let res: Response;
    try {
      res = await fetchImpl(`${url}${path}`, {
        method,
        headers: { 'x-luci': '1', ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch {
      throw new BridgeError(`Luci is not reachable at ${url}. Is \`luci serve\` still running?`);
    }
    const data = await res.json().catch(() => ({})) as { error?: string };
    if (!res.ok) throw new BridgeError(data.error ?? `Luci answered ${res.status}.`);
    return data as T;
  };
  return {
    kind: 'project',
    list: async () => (await call<{ items: FeedbackItem[] }>('GET', '/feedback')).items,
    add: async (item) => (await call<{ item: FeedbackItem }>('POST', '/feedback', item)).item,
    change: async (ref, change) => (await call<{ item: FeedbackItem }>('PATCH', `/feedback/${ref}`, change)).item,
    remove: async (ref) => { await call('DELETE', `/feedback/${ref}`); },
    prompt: (request) => call('POST', '/feedback/prompt', request),
    clear: async (which) => (await call<{ removed: string[] }>('POST', '/feedback/clear', { which })).removed,
    saveCapture: (fileName, markdown) => call('POST', '/design', { fileName, markdown })
  };
}

/** Is `luci serve` answering at this address, for this kind of page? Resolves false quickly when not. */
export async function bridgeReachable(url: string, timeoutMs = 1500): Promise<{ ok: boolean; initialized: boolean; project?: string }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`${url}/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    const data = await res.json() as { ok?: boolean; initialized?: boolean; project?: string };
    return { ok: Boolean(data.ok), initialized: Boolean(data.initialized), ...(data.project ? { project: data.project } : {}) };
  } catch {
    return { ok: false, initialized: false };
  }
}

/** A tiny storage interface (localStorage fits), so tests can use a Map. */
export interface KeyValue {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');

/** This browser only: items under one storage key for the app's address. */
export function browserBackend(storage: KeyValue, key = 'luci.feedback'): FeedbackBackend {
  const load = (): FeedbackItem[] => {
    try {
      const raw = JSON.parse(storage.getItem(key) ?? '[]') as unknown[];
      return byRef(raw.flatMap(r => { const p = feedbackItemSchema.safeParse(r); return p.success ? [p.data] : []; }));
    } catch {
      return [];
    }
  };
  const save = (items: FeedbackItem[]) => storage.setItem(key, JSON.stringify(items));
  const now = () => new Date().toISOString();
  const update = (ref: string, fn: (i: FeedbackItem) => FeedbackItem) => {
    const items = load();
    const i = items.findIndex(x => x.ref === ref);
    if (i === -1) throw new BridgeError(`No feedback item ${ref}.`);
    items[i] = feedbackItemSchema.parse({ ...fn(items[i]!), updatedAt: now() });
    save(items);
    return items[i]!;
  };
  return {
    kind: 'browser',
    list: async () => load(),
    add: async (input) => {
      const items = load();
      const route = input.page.route ?? routeOf(input.page.url);
      const at = now();
      const item = feedbackItemSchema.parse({
        id: randomId(), ref: nextRef(items, route), page: { ...input.page, route }, target: input.target,
        comment: input.comment, intent: input.intent, priority: input.priority, status: 'pending', createdAt: at, updatedAt: at, thread: []
      });
      save([...items, item]);
      return item;
    },
    change: async (ref, change) => update(ref, i => {
      if (change.action === 'answer') return { ...i, status: 'acknowledged', thread: [...i.thread, { from: 'person', text: change.text, at: now() }] };
      if (change.action === 'reopen') { const { resolution: _r, ...rest } = i; return { ...rest, status: 'pending' }; }
      if (change.action === 'resolve') return { ...i, status: 'resolved', resolution: change.summary };
      return { ...i, ...(change.comment ? { comment: change.comment } : {}), ...(change.intent ? { intent: change.intent } : {}), ...(change.priority ? { priority: change.priority } : {}) };
    }),
    remove: async (ref) => save(load().filter(i => i.ref !== ref)),
    prompt: async (request) => {
      const items = load();
      const send = items.filter(i => (request.includeSent ? OPEN_STATUSES.includes(i.status) : i.status === 'pending'));
      if (!send.length) return { prompt: null, refs: [] };
      const prompt = formatFeedbackPrompt(send, { detail: request.detail ?? 'standard' });
      const at = now();
      const refs = new Set(send.map(i => i.ref));
      save(items.map(i => (refs.has(i.ref) ? { ...i, status: i.status === 'pending' ? 'sent' : i.status, sentAt: at, updatedAt: at } : i)));
      return { prompt, refs: [...refs] };
    },
    clear: async (which) => {
      const items = load();
      const gone = items.filter(i => which === 'all' || i.status === 'resolved' || i.status === 'dismissed');
      save(items.filter(i => !gone.includes(i)));
      return gone.map(i => i.ref);
    }
  };
}
