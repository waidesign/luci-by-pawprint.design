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
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { z } from 'zod';
import { CheckStore, DesignError, DesignStore, FeedbackError, FeedbackStore, findStylesheets, proposeCaptureRule } from '@luci-dev/brain';
import { buildBaseline, checkRunSchema } from '@luci-dev/format/capture';
import { serverResolver } from './resolve.js';
import { PRODUCT } from '@luci-dev/format';
import { DETAIL_LEVELS, FEEDBACK_INTENTS, FEEDBACK_PRIORITIES, REVIEWER_ROLES, designCheckSchema, feedbackItemSchema, formatFeedbackPrompt, layoutSchema, wireframeSchema } from '@luci-dev/format/feedback';

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

/** An origin of a browser extension: chrome-extension:, moz-extension:, or safari-web-extension:. */
export function isExtensionOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.protocol === 'chrome-extension:' || u.protocol === 'moz-extension:' || u.protocol === 'safari-web-extension:';
  } catch {
    return false;
  }
}

/** An origin allowed to call the bridge: local pages or browser extensions. */
export function isAllowedOrigin(origin: string): boolean {
  return isLoopbackOrigin(origin) || isExtensionOrigin(origin);
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
  reviewerRoles: z.array(z.enum(REVIEWER_ROLES)).min(1).optional(),
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

function readBody(req: http.IncomingMessage, res?: http.ServerResponse): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (c: Buffer) => {
      if (tooLarge) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        req.pause();
        if (res && !res.headersSent) {
          res.writeHead(413, { 'content-type': 'application/json', 'connection': 'close' });
          res.end(JSON.stringify({ error: 'The request is too large.' }));
        }
        reject(new HttpError(413, 'The request is too large.'));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (tooLarge) return;
      const text = Buffer.concat(chunks).toString('utf8');
      try { resolve(text ? JSON.parse(text) : {}); } catch { reject(new HttpError(400, 'The body is not valid JSON.')); }
    });
    req.on('error', err => {
      if (!tooLarge) reject(err);
    });
  });
}

const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const r = schema.safeParse(value);
  if (!r.success) throw new HttpError(400, z.prettifyError(r.error));
  return r.data;
};

const SKIP_MTIME_DIRS = new Set(['node_modules', '.git', '.luci', 'dist', 'build', '.next', '.nuxt', '.output', 'coverage']);

/**
 * Best-effort timestamp of the project's latest change, for Team Feedback staleness checks:
 * uses the latest git commit time in a git repo; otherwise checks a shallow slice of files
 * (capped so `/health` never scans a whole repo).
 */
function readProjectLastModified(projectDir: string): string | undefined {
  if (fs.existsSync(path.join(projectDir, '.git'))) {
    try {
      const out = execFileSync('git', ['log', '-1', '--format=%cI'], {
        cwd: projectDir,
        encoding: 'utf8',
        timeout: 1500,
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim();
      if (out && !Number.isNaN(Date.parse(out))) return new Date(out).toISOString();
    } catch {
      // empty repo or git unavailable; fall through to cheap shallow scan
    }
  }
  let newest = 0;
  let seen = 0;
  const MAX_ENTRIES = 60;
  const scan = (dir: string, depth: number) => {
    if (depth > 2 || seen >= MAX_ENTRIES) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (seen >= MAX_ENTRIES) break;
      if (SKIP_MTIME_DIRS.has(entry.name)) continue;
      seen++;
      const full = path.join(dir, entry.name);
      try {
        const st = fs.statSync(full);
        if (st.isFile() && st.mtimeMs > newest) newest = st.mtimeMs;
        else if (st.isDirectory() && depth < 2 && /^(src|app|pages|components|public|styles)$/i.test(entry.name)) {
          scan(full, depth + 1);
        }
      } catch { /* ignore unreadable entries */ }
    }
  };
  scan(projectDir, 0);
  return newest > 0 ? new Date(newest).toISOString() : undefined;
}

export function startBridge(options: BridgeOptions): Promise<Bridge> {
  const feedback = new FeedbackStore(options.projectDir);
  const design = new DesignStore(options.projectDir);
  const checks = new CheckStore(options.projectDir);
  const resolveServer = serverResolver(options.projectDir);
  let port = options.port ?? DEFAULT_PORT;
  let cachedModified: { at: number; value?: string } | null = null;
  const lastModifiedAt = () => {
    const now = Date.now();
    if (!cachedModified || now - cachedModified.at > 10_000) {
      cachedModified = { at: now, value: readProjectLastModified(options.projectDir) };
    }
    return cachedModified.value;
  };

  const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    const send = (status: number, body: unknown, type = 'application/json; charset=utf-8') => {
      const headers: Record<string, string> = { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
      if (origin && isAllowedOrigin(origin)) {
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
      if (origin && !isAllowedOrigin(origin)) throw new HttpError(403, `${PRODUCT.name} only answers pages on this machine or browser extensions.`);
      if (req.method === 'OPTIONS') { send(204, ''); return; }

      const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
      const route = url.pathname.replace(/\/+$/, '') || '/';
      const write = req.method !== 'GET';
      if (write) {
        if (req.headers[BRIDGE_HEADER] !== '1') throw new HttpError(403, `Writes need the ${BRIDGE_HEADER} header.`);
        if (req.method !== 'DELETE' && !/^application\/json\b/i.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'Send JSON.');
      }

      if (req.method === 'GET' && route === '/health') {
        const modified = lastModifiedAt();
        send(200, { ok: true, product: PRODUCT.name, version: options.version ?? '', project: options.projectDir, initialized: feedback.available, ...(modified ? { lastModifiedAt: modified } : {}) });
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
        const body = parse(resolveSchema, await readBody(req, res));
        send(200, { locations: body.frames.map(f => resolveServer(f)) });
        return;
      }
      if (!feedback.available) throw new HttpError(409, `No ${PRODUCT.projectDir}/ in ${options.projectDir}. Run \`${PRODUCT.command} init\` there first.`);

      if (route === '/feedback' && req.method === 'GET') { send(200, { items: feedback.list() }); return; }
      if (route === '/feedback' && req.method === 'POST') {
        const body = parse(newItemSchema, await readBody(req, res));
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
        const body = parse(promptSchema, await readBody(req, res));
        const open = body.includeSent ? feedback.open() : feedback.list({ status: ['pending'] });
        const items = body.refs ? open.filter(i => body.refs!.includes(i.ref)) : open;
        if (!items.length) { send(200, { prompt: null, refs: [] }); return; }
        const prompt = formatFeedbackPrompt(items, { detail: body.detail ?? 'standard' });
        feedback.markSent(items.map(i => i.id));
        send(200, { prompt, refs: items.map(i => i.ref) });
        return;
      }
      if (route === '/feedback/clear' && req.method === 'POST') { send(200, { removed: feedback.clear(parse(clearSchema, await readBody(req, res)).which) }); return; }
      const one = /^\/feedback\/(P\d+-A\d+)$/.exec(route)?.[1];
      if (one && req.method === 'PATCH') {
        const body = parse(patchSchema, await readBody(req, res));
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
      // Automatic design check (v0.4): the toolbar's latest run of each check, for the agent
      if (route === '/checks' && req.method === 'GET') { send(200, { runs: checks.list() }); return; }
      if (route === '/checks' && req.method === 'POST') {
        if (!checks.available) throw new HttpError(409, `No ${PRODUCT.projectDir}/ in this project yet: run \`${PRODUCT.command} init\` there.`);
        const run = parse(checkRunSchema, await readBody(req, res));
        checks.save(run);
        const { resolved, updated } = feedback.reconcileWithCheck(run);
        if (resolved.length) {
          console.info(`Luci: Auto-check resolved ${resolved.length} feedback note${resolved.length === 1 ? '' : 's'} (${resolved.join(', ')}) for ${run.label || run.design}.`);
        }
        send(201, { saved: true, resolved, updated });
        return;
      }
      // The project's own tokens (v0.4, remap to my tokens): read from its stylesheets now, so they are current
      if (route === '/tokens' && req.method === 'GET') {
        const baseline = buildBaseline(findStylesheets(options.projectDir), { project: 'project', captured: new Date().toISOString().slice(0, 10) });
        send(200, { tokens: baseline.tokens.map(t => ({ token: t.token, value: t.resolved })), stylesheets: baseline.files.length });
        return;
      }
      // One saved file's text (a design check reads its design file); only names in .luci/design/
      const designFile = /^\/design\/([^/]+)$/.exec(route)?.[1];
      if (designFile && req.method === 'GET') {
        let file: string;
        try {
          file = decodeURIComponent(designFile);
        } catch {
          throw new HttpError(400, `Malformed URI encoding in design file path: ${designFile}`);
        }
        const markdown = design.read(file);
        if (markdown === null) throw new HttpError(404, `No design file ${file} in ${PRODUCT.projectDir}/design/.`);
        send(200, { file, markdown });
        return;
      }
      // Capture to rule (v0.3.2): a saved component capture becomes a proposed rule (never rules.md itself)
      if (route === '/rule' && req.method === 'POST') {
        const body = parse(ruleSchema, await readBody(req, res));
        const rule = proposeCaptureRule(options.projectDir, body.file);
        send(rule.existed ? 200 : 201, { path: rule.path, existed: rule.existed, rule: rule.proposal.proposed });
        return;
      }
      if (route === '/design' && req.method === 'POST') {
        const body = parse(designSchema, await readBody(req, res));
        send(201, design.save(body.fileName, body.markdown));
        return;
      }
      throw new HttpError(404, 'Not found.');
    };

    handle().catch((err: unknown) => {
      const status = err instanceof HttpError ? err.status : err instanceof FeedbackError ? (/No feedback item/.test(err.message) ? 404 : 409) : err instanceof DesignError || err instanceof URIError ? 400 : 500;
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
