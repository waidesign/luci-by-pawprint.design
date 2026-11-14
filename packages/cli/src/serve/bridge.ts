/**
 * The bridge between Luci's dev toolbar (in the browser) and the project's memory folder: a small
 * HTTP server on 127.0.0.1 that keeps feedback items in .luci/feedback/ and saves captures to
 * .luci/design/, the same files luci-mcp serves to the agent. It also serves the toolbar script.
 *
 * Safety: it listens on 127.0.0.1 only; the Host header must name it (no DNS rebinding); browsers
 * may call it only from a page on this machine (localhost, 127.0.0.1, [::1], *.localhost); every
 * write needs a JSON body and the X-Luci header, which a page can only send after the CORS check.
 * It reads and writes nothing outside .luci/feedback/ and .luci/design/.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { z } from 'zod';
import { DesignError, DesignStore, FeedbackError, FeedbackStore, proposeCaptureRule } from '@luci/brain';
import { serverResolver } from './resolve.js';
import { PRODUCT } from '@luci/format';
import { DETAIL_LEVELS, FEEDBACK_INTENTS, FEEDBACK_PRIORITIES, designCheckSchema, feedbackItemSchema, formatFeedbackPrompt, layoutSchema, wireframeSchema } from '@luci/format/feedback';

export const DEFAULT_PORT = 4545;
/** The header every write must carry (a page cannot send it without passing the CORS check). */
export const BRIDGE_HEADER = 'x-luci';
export const MAX_BODY_BYTES = 3 * 1024 * 1024;

export interface BridgeOptions {
  projectDir: string;
  /** 0 picks a free port. Default 4545. */
  port?: number;
  /** The toolbar script to serve at /toolbar.js, or null when it is not built. */
  toolbarScript?: () => string | null;
  /** Luci's version, for /health. */
  version?: string;
}

export interface Bridge {
  url: string;
  port: number;
  close(): Promise<void>;
}

/** An origin a page on this machine has: http(s) on localhost, 127.0.0.1, [::1] or a *.localhost name. */
export function isLoopbackOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '[::1]';
  } catch {
    return false;
  }
}

/**
 * A source path as the project knows it: an absolute path inside the project becomes relative
 * ("/home/me/shop/src/App.tsx" -> "src/App.tsx"); anything else is kept as the browser saw it.
 */
export function relativeSource(projectDir: string, file: string): string {
  const abs = /^[A-Za-z]:[\\/]/.test(file) || file.startsWith('/') ? path.resolve(file) : null;
  if (!abs) return file;
  const rel = path.relative(projectDir, abs);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.split(path.sep).join('/') : file;
}

const newItemSchema = z.object({
  page: z.object({ url: z.string().min(1), route: z.string().min(1).optional(), title: z.string().optional(), source: z.string().min(1).optional() }),
  target: feedbackItemSchema.shape.target,
  comment: z.string().trim().min(1),
  layout: layoutSchema.optional(),
  wireframe: wireframeSchema.optional(),
  check: designCheckSchema.optional(),
  intent: z.enum(FEEDBACK_INTENTS),
  priority: z.enum(FEEDBACK_PRIORITIES)
});
const patchSchema = z.union([
  z.object({ action: z.literal('edit'), comment: z.string().trim().min(1).optional(), intent: z.enum(FEEDBACK_INTENTS).optional(), priority: z.enum(FEEDBACK_PRIORITIES).optional() }),
  z.object({ action: z.literal('done') }),
  z.object({ action: z.literal('reopen') })
]);
const promptSchema = z.object({ detail: z.enum(DETAIL_LEVELS).optional(), includeSent: z.boolean().optional(), refs: z.array(z.string()).optional() });
const clearSchema = z.object({ which: z.enum(['done', 'all']) });
const resolveSchema = z.object({
  frames: z.array(z.object({ url: z.string().min(1).max(4096), line: z.number().int().positive(), column: z.number().int().positive().optional() })).max(20)
});
const designSchema = z.object({ fileName: z.string().min(1), markdown: z.string().min(1) });
const ruleSchema = z.object({ file: z.string().min(1).max(200) });

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) { reject(new HttpError(413, 'The request is too large.')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      try { resolve(text ? JSON.parse(text) : {}); } catch { reject(new HttpError(400, 'The body is not valid JSON.')); }
    });
    req.on('error', reject);
  });
}

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success) throw new HttpError(400, z.prettifyError(r.error));
  return r.data;
};

export function startBridge(options: BridgeOptions): Promise<Bridge> {
  const feedback = new FeedbackStore(options.projectDir);
  const design = new DesignStore(options.projectDir);
  const resolveServer = serverResolver(options.projectDir);
  let port = options.port ?? DEFAULT_PORT;

  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    const send = (status: number, body: unknown, type = 'application/json; charset=utf-8') => {
      const headers: Record<string, string> = { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
      if (origin && isLoopbackOrigin(origin)) {
        Object.assign(headers, {
          'access-control-allow-origin': origin,
          vary: 'Origin',
          'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'access-control-allow-headers': `content-type, ${BRIDGE_HEADER}`,
          'access-control-allow-private-network': 'true',
          'access-control-max-age': '600'
        });
      }
      res.writeHead(status, headers).end(typeof body === 'string' ? body : JSON.stringify(body));
    };

    const handle = async () => {
      // DNS rebinding: a page on another name that resolves to 127.0.0.1 has that name in Host
      const host = (req.headers.host ?? '').toLowerCase();
      if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) throw new HttpError(403, 'Unknown host.');
      if (origin && !isLoopbackOrigin(origin)) throw new HttpError(403, `${PRODUCT.name} only answers pages on this machine.`);
      if (req.method === 'OPTIONS') { send(204, ''); return; }

      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      const route = url.pathname.replace(/\/+$/, '') || '/';
      const write = req.method !== 'GET';
      if (write) {
        if (req.headers[BRIDGE_HEADER] !== '1') throw new HttpError(403, `Writes need the ${BRIDGE_HEADER} header.`);
        if (req.method !== 'DELETE' && !/^application\/json\b/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'Send JSON.');
      }

      if (req.method === 'GET' && route === '/health') {
        send(200, { ok: true, product: PRODUCT.name, version: options.version ?? '', project: options.projectDir, initialized: feedback.available });
        return;
      }
      if (req.method === 'GET' && route === '/toolbar.js') {
        const script = options.toolbarScript?.() ?? null;
        if (!script) throw new HttpError(404, 'The toolbar script is not built. Run `pnpm build` in the Luci repository.');
        send(200, `window.__LUCI_BRIDGE__ = ${JSON.stringify(`http://${host}`)};\n${script}`, 'text/javascript; charset=utf-8');
        return;
      }
      // Server components' positions (read only: source maps inside the project)
      if (route === '/resolve' && req.method === 'POST') {
        const body = parse(resolveSchema, await readBody(req));
        send(200, { locations: body.frames.map(f => resolveServer(f)) });
        return;
      }
      if (!feedback.available) throw new HttpError(409, `No ${PRODUCT.projectDir}/ in ${options.projectDir}. Run \`${PRODUCT.command} init\` there first.`);

      if (route === '/feedback' && req.method === 'GET') { send(200, { items: feedback.list() }); return; }
      if (route === '/feedback' && req.method === 'POST') {
        const body = parse(newItemSchema, await readBody(req));
        const rel = (file: string) => relativeSource(options.projectDir, file);
        const item = feedback.add({
          ...body,
          page: { ...body.page, ...(body.page.source ? { source: rel(body.page.source) } : {}) },
          target: { ...body.target, ...(body.target.source ? { source: { ...body.target.source, file: rel(body.target.source.file) } } : {}) }
        });
        send(201, { item });
        return;
      }
      if (route === '/feedback/prompt' && req.method === 'POST') {
        const body = parse(promptSchema, await readBody(req));
        const open = body.includeSent ? feedback.open() : feedback.list({ status: ['pending'] });
        const items = body.refs ? open.filter(i => body.refs!.includes(i.ref)) : open;
        if (!items.length) { send(200, { prompt: null, refs: [] }); return; }
        const prompt = formatFeedbackPrompt(items, { detail: body.detail ?? 'standard' });
        feedback.markSent(items.map(i => i.id));
        send(200, { prompt, refs: items.map(i => i.ref) });
        return;
      }
      if (route === '/feedback/clear' && req.method === 'POST') { send(200, { removed: feedback.clear(parse(clearSchema, await readBody(req)).which) }); return; }
      const one = /^\/feedback\/(P\d+-A\d+)$/.exec(route)?.[1];
      if (one && req.method === 'PATCH') {
        const body = parse(patchSchema, await readBody(req));
        const item = body.action === 'done' ? feedback.markDone(one)
          : body.action === 'reopen' ? feedback.reopen(one)
          : feedback.edit(one, { ...(body.comment ? { comment: body.comment } : {}), ...(body.intent ? { intent: body.intent } : {}), ...(body.priority ? { priority: body.priority } : {}) });
        send(200, { item });
        return;
      }
      if (one && req.method === 'DELETE') {
        if (!feedback.remove(one)) throw new HttpError(404, `No feedback item ${one}.`);
        send(200, { removed: [one] });
        return;
      }
      if (route === '/design' && req.method === 'GET') { send(200, { files: design.list() }); return; }
      // One saved file's text (a design check reads its design file); only names in .luci/design/
      const designFile = /^\/design\/([^/]+)$/.exec(route)?.[1];
      if (designFile && req.method === 'GET') {
        const file = decodeURIComponent(designFile);
        const markdown = design.read(file);
        if (markdown === null) throw new HttpError(404, `No design file ${file} in ${PRODUCT.projectDir}/design/.`);
        send(200, { file, markdown });
        return;
      }
      // Capture to rule (v0.3.2): a saved component capture becomes a proposed rule (never rules.md itself)
      if (route === '/rule' && req.method === 'POST') {
        const body = parse(ruleSchema, await readBody(req));
        const rule = proposeCaptureRule(options.projectDir, body.file);
        send(rule.existed ? 200 : 201, { path: rule.path, existed: rule.existed, rule: rule.proposal.proposed });
        return;
      }
      if (route === '/design' && req.method === 'POST') {
        const body = parse(designSchema, await readBody(req));
        send(201, design.save(body.fileName, body.markdown));
        return;
      }
      throw new HttpError(404, 'Not found.');
    };

    handle().catch((err: unknown) => {
      const status = err instanceof HttpError ? err.status : err instanceof FeedbackError ? (/No feedback item/.test(err.message) ? 404 : 409) : err instanceof DesignError ? 400 : 500;
      if (!res.headersSent) send(status, { error: err instanceof Error ? err.message : String(err) });
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      port = (server.address() as AddressInfo).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        port,
        close: () => new Promise<void>(done => { server.closeAllConnections?.(); server.close(() => done()); })
      });
    });
  });
}
