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
  type DesignCheck,
  type DetailLevel,
  type FeedbackIntent,
  type FeedbackItem,
  type FeedbackPriority,
  type LayoutPlan,
  type SourceLocation,
  type Wireframe
} from '@luci-dev/format/feedback';
import type { ServerResolver } from './react.js';
import type { CheckRun } from '@luci-dev/format/capture';

export interface NewItem {
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

/** A design capture saved in the project (.luci/design/), as `luci serve` lists it. */
export interface SavedCapture {
  file: string;
  name: string;
  scope: string;
  type: string;
  source: string;
}

export type ItemChange =
  | { action: 'edit'; comment?: string; intent?: FeedbackIntent; priority?: FeedbackPriority }
  /** The person marks it done (after checking the agent's work). */
  | { action: 'done' }
  | { action: 'reopen' };

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
  /** The captures saved in .luci/design/ (project only). */
  listCaptures?(): Promise<SavedCapture[]>;
  /** One saved capture's text (project only). */
  readCapture?(file: string): Promise<string>;
  /** Propose a rule from a saved component capture (project only): the proposal's path and the rule's line. */
  proposeRule?(file: string): Promise<{ path: string; existed: boolean; rule: string }>;
  /** Map server-side positions (server components) to the project's files (project only). */
  resolveFrames?: ServerResolver;
  /** The project's own tokens, read from its stylesheets (project only; v0.4, remap to my tokens). */
  projectTokens?(): Promise<{ token: string; value: string }[]>;
  /** Keep a design check's latest run for the agent (v0.4, automatic design check) and reconcile open feedback notes. */
  saveCheck?(run: CheckRun): Promise<{ saved: boolean; resolved?: string[]; updated?: string[] }>;
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
    saveCapture: (fileName, markdown) => call('POST', '/design', { fileName, markdown }),
    listCaptures: async () => (await call<{ files: SavedCapture[] }>('GET', '/design')).files,
    proposeRule: (file) => call('POST', '/rule', { file }),
    readCapture: async (file) => (await call<{ markdown: string }>('GET', `/design/${encodeURIComponent(file)}`)).markdown,
    resolveFrames: async (frames) => (await call<{ locations: (SourceLocation | null)[] }>('POST', '/resolve', { frames })).locations,
    projectTokens: async () => (await call<{ tokens: { token: string; value: string }[] }>('GET', '/tokens')).tokens,
    saveCheck: (run) => call<{ saved: boolean; resolved: string[]; updated: string[] }>('POST', '/checks', run)
  };
}

export interface BridgeHealth {
  ok: boolean;
  initialized: boolean;
  project?: string;
  /** Why it is not reachable: refused, timed out, or an unexpected answer. */
  reason?: string;
}

/** Is `luci serve` answering at this address? One try, at most `timeoutMs`. */
export async function bridgeHealth(url: string, timeoutMs = 3000): Promise<BridgeHealth> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${url}/health`, { signal: ctrl.signal, cache: 'no-store' });
    const data = await res.json() as { ok?: boolean; initialized?: boolean; project?: string; error?: string };
    if (!res.ok || !data.ok) return { ok: false, initialized: false, reason: data.error ?? `answered ${res.status}` };
    return { ok: true, initialized: Boolean(data.initialized), ...(data.project ? { project: data.project } : {}) };
  } catch (err) {
    return { ok: false, initialized: false, reason: ctrl.signal.aborted ? `no answer within ${timeoutMs}ms` : err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Is `luci serve` answering? One try by default (a refused connection takes about 2s on Windows, so
 * retries would hold the toolbar back); the toolbar's "This browser" badge checks again on a click.
 */
export async function bridgeReachable(url: string, options: { attempts?: number; timeoutMs?: number; waitMs?: number } = {}): Promise<BridgeHealth> {
  const attempts = options.attempts ?? 1;
  let last: BridgeHealth = { ok: false, initialized: false };
  for (let i = 0; i < attempts; i++) {
    last = await bridgeHealth(url, options.timeoutMs ?? 3000);
    if (last.ok) return last;
    if (i < attempts - 1) await new Promise(r => setTimeout(r, options.waitMs ?? 300));
  }
  return last;
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
        comment: input.comment, ...(input.layout ? { layout: input.layout } : {}), ...(input.wireframe ? { wireframe: input.wireframe } : {}), ...(input.check ? { check: input.check } : {}), intent: input.intent, priority: input.priority, status: 'pending', createdAt: at, updatedAt: at, thread: []
      });
      save([...items, item]);
      return item;
    },
    change: async (ref, change) => update(ref, i => {
      if (change.action === 'done') return { ...i, status: 'resolved' };
      if (change.action === 'reopen') { const { resolution: _r, ...rest } = i; return { ...rest, status: 'pending' }; }
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
    },
    saveCheck: async (run: CheckRun) => {
      const items = load();
      const normalize = (f: string) => f.replace(/^\.luci\/design\//, '').replace(/^\/+/, '');
      const runDesign = normalize(run.design);
      const diffKey = (part: string, property: string, state?: string) => `${part}::${property}::${state ?? ''}`;
      const diffMap = new Map(run.differences.map(d => [diffKey(d.part, d.property, d.state), d]));
      const resolved: string[] = [];
      const updated: string[] = [];
      let changed = false;

      for (let idx = 0; idx < items.length; idx++) {
        const item = items[idx]!;
        if (!OPEN_STATUSES.includes(item.status) || !item.check) continue;
        if (normalize(item.check.design) !== runDesign) continue;

        const key = diffKey(item.check.part, item.check.property, item.check.state);
        const remaining = diffMap.get(key);
        if (!remaining) {
          items[idx] = { ...item, status: 'resolved', resolution: `Resolved automatically: matches design on check at ${run.checkedAt}`, updatedAt: now() };
          resolved.push(item.ref);
          changed = true;
        } else if (remaining.actual !== item.check.actual) {
          items[idx] = { ...item, comment: remaining.comment, check: { ...item.check, actual: remaining.actual }, updatedAt: now() };
          updated.push(item.ref);
          changed = true;
        }
      }
      if (changed) save(items);
      return { saved: true, resolved, updated };
    }
  };
}
