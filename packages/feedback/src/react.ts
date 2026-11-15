/**
 * The React adapter (FR25): from a DOM element, the components around it and where its JSX is
 * written. React keeps a fiber on every element it renders (a "__reactFiber$..." property). In
 * development each fiber knows what created it (`_debugOwner`) and where: React 19 keeps the stack
 * of that moment (`_debugStack`), React 18 and older the JSX location (`_debugSource`). Luci never
 * imports React: it reads what the page already has. In a production build none of this exists,
 * and the item keeps its selector and text only.
 *
 * Server components (Next.js App Router): the browser has no fiber for them, only a record React
 * keeps (`{ name, env: 'Server', owner, stack }`), whose stack points into the server's bundle on
 * disk. The creator chain is followed through those records too; their positions are mapped by
 * `luci serve` (which can read the server's source maps), or named by module when it is not there.
 */
import type { SourceLocation } from '@luci-dev/format/feedback';

/** A position in served code, as a stack trace, `_debugSource` or a server record gives it. */
export interface CodeFrame {
  /** The function running there, when the stack says ("PlanCard", "jsxDEV"). */
  fn?: string;
  url: string;
  line: number;
  column?: number;
}

/** What an adapter found around an element. */
export interface FrameworkInfo {
  framework: string;
  /** Components around the element, outermost first (library components left out). */
  components: string[];
  /**
   * Where the element's JSX may be written, best first: the frames where it was created, then
   * where each component around it was used (when the element came from library code).
   */
  frames: CodeFrame[];
  /** Where each component's own JSX may be, by position in `components`, best first. */
  componentFrames: CodeFrame[][];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fiber = any;

/** React's fiber for a DOM element, or null when React did not render it. */
export function fiberOf(el: Element): Fiber | null {
  for (const key of Object.keys(el)) {
    if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) return (el as unknown as Record<string, Fiber>)[key] ?? null;
  }
  return null;
}

/** The nearest element (itself or up) that React rendered, for text nodes and portals' children. */
export function nearestFiber(el: Element): Fiber | null {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const f = fiberOf(n);
    if (f) return f;
  }
  return null;
}

/** A server component's record (React 19 with server components): not a fiber. */
export const isServerRecord = (x: Fiber): boolean => Boolean(x) && typeof x === 'object' && typeof x.name === 'string' && !('tag' in x) && ('env' in x || 'owner' in x);

/** A component's name: displayName, then the function's name; forwardRef and memo look inside. */
export function componentName(fiber: Fiber): string | null {
  if (isServerRecord(fiber)) return /^[A-Z_$]/.test(fiber.name) ? fiber.name : null;
  let type = fiber?.type;
  if (!type || typeof type === 'string') return null;
  // memo(forwardRef(Fn)) and the like: look inside, taking a displayName on the way
  for (let i = 0; i < 3 && typeof type === 'object' && type; i++) {
    if (type.displayName) return String(type.displayName);
    type = type.render ?? type.type;
  }
  if (typeof type !== 'function') return null;
  const name = type.displayName ?? type.name;
  return typeof name === 'string' && /^[A-Z_$]/.test(name) ? name : null;
}

/**
 * Library code by address: React itself, a dev server's pre-bundled dependencies (Vite), and
 * Turbopack or webpack chunks of node_modules and Next's own code.
 */
const LIBRARY_URL = /\/node_modules\/|\/\.vite\/deps\/|\/@react-refresh|\/@vite\/|node_modules_|next_dist_|\/_next\/static\/chunks\/(webpack|framework|main-app|polyfill)|react-stack-|webpack\/runtime|\[turbopack\]/;
/** React's own functions in a creation stack. */
const REACT_FUNCTIONS = /^(Object\.)?(exports\.)?(jsxs?|jsxDEV|jsxsDEV|createElement|cloneElement|fakeJSXCallSite|react_stack_bottom_frame|react-stack-top-frame)$/;

export const isLibraryFrame = (f: CodeFrame): boolean => !f.url || REACT_FUNCTIONS.test(f.fn ?? '') || LIBRARY_URL.test(f.url);

/** Frames of a stack trace: `at Name (url:line:col)` or `at url:line:col` (Chrome), `Name@url:line:col` (Firefox, Safari). */
export function stackFrames(stack: string): CodeFrame[] {
  const out: CodeFrame[] = [];
  // The address runs to the last ":line:column" (it can hold parentheses: Turbopack's "(ecmascript)")
  const SCHEME = /^(https?|file|about|webpack-internal|webpack|turbopack):/;
  for (const raw of stack.split('\n')) {
    const line = raw.trim();
    const chrome = /^at (?:(.+?) \()?(\S+?):(\d+):(\d+)\)?$/.exec(line);
    const firefox = chrome ? null : /^([^@\s]*)@(\S+?):(\d+):(\d+)$/.exec(line);
    const m = chrome ?? firefox;
    if (!m || !SCHEME.test(m[2]!)) continue;
    out.push({ ...(m[1] ? { fn: m[1] } : {}), url: m[2]!, line: Number(m[3]), column: Number(m[4]) });
  }
  return out;
}

/** Every frame of where something was created: a fiber's stack (or React 18's JSX location), or a server record's stack. */
export function creationFrames(x: Fiber): CodeFrame[] {
  if (isServerRecord(x)) {
    if (Array.isArray(x.stack)) {
      // [functionName, url, line, column, ...]
      return x.stack.flatMap((f: unknown[]) => (typeof f[1] === 'string' && f[1] ? [{ ...(f[0] ? { fn: String(f[0]) } : {}), url: f[1], line: Number(f[2]) || 1, column: Number(f[3]) || 1 }] : []));
    }
    return typeof x.debugStack?.stack === 'string' ? stackFrames(x.debugStack.stack) : [];
  }
  const stack = x?._debugStack?.stack;
  if (typeof stack === 'string') return stackFrames(stack);
  const src = x?._debugSource;
  if (src && typeof src.fileName === 'string') return [{ url: src.fileName, line: Number(src.lineNumber) || 1, ...(src.columnNumber ? { column: Number(src.columnNumber) } : {}) }];
  return [];
}

/** The first frame in user code, if any. */
export const creationFrame = (x: Fiber): CodeFrame | undefined => creationFrames(x).find(f => !isLibraryFrame(f));

/** Who created this fiber or server record (its owner), or null. */
export const ownerOf = (x: Fiber): Fiber | null => (isServerRecord(x) ? x.owner ?? null : x?._debugOwner ?? null);

/** At most this many components, innermost kept (the outer ones are the app's shell). */
export const MAX_COMPONENTS = 8;

/**
 * Components around an element and where each one's JSX may be. The owner chain is used (who
 * created whom), through server components too, so library wrappers that only pass elements
 * through (routers, providers) stay out; when a build has no owners, the parent chain is used.
 */
export function reactInfo(el: Element): FrameworkInfo | null {
  const host = nearestFiber(el);
  if (!host) return null;
  // Innermost first: the element's fiber, then each owner
  const chain: Fiber[] = [host];
  const seen = new Set<Fiber>([host]);
  for (let o = ownerOf(host); o && !seen.has(o) && chain.length < 50; o = ownerOf(o)) { chain.push(o); seen.add(o); }
  if (chain.length === 1) {
    for (let p = host.return; p && chain.length < 50; p = p.return) if (componentName(p)) chain.push(p);
  }
  const userFrames = (x: Fiber) => creationFrames(x).filter(f => !isLibraryFrame(f));
  // A component's own JSX is where the next one inward was created. A component whose JSX is all
  // library code (Next's Link, a UI kit's wrapper) is left out of the list
  const named: { name: string; frames: CodeFrame[] }[] = [];
  for (let i = 1; i < chain.length; i++) {
    const name = componentName(chain[i]);
    if (!name) continue;
    const all = creationFrames(chain[i - 1]);
    const frames = all.filter(f => !isLibraryFrame(f));
    if (all.length && !frames.length) continue;
    named.push({ name, frames });
  }
  named.reverse();
  const kept = named.slice(-MAX_COMPONENTS);
  // The element's JSX: where it was created, else (made inside library code) where the nearest
  // component around it was used
  const frames = chain.flatMap(userFrames);
  return { framework: 'react', components: kept.map(n => n.name), frames, componentFrames: kept.map(n => n.frames) };
}

/**
 * The module a server bundle's frame comes from, when Turbopack names it in the address:
 * "...chunk.js?id=[project]/apps/web/src/app/page.tsx+[app-rsc]+(ecmascript)" -> "apps/web/src/app/page.tsx".
 */
export function moduleIdPath(url: string): string | null {
  // The "?id=" may itself be encoded (a nested address encoded whole): look in decoded forms too
  let id: string | undefined;
  for (let u = url, i = 0; i < 3 && !id; i++) {
    id = /[?&]id=([^&]+)/.exec(u)?.[1];
    try { u = decodeURIComponent(u); } catch { break; }
  }
  if (!id) return null;
  // Next nests a server address in the browser's, encoded twice: decode until it settles
  let p = id;
  for (let i = 0; i < 3 && /%[0-9A-Fa-f]{2}/.test(p); i++) {
    try { p = decodeURIComponent(p); } catch { return null; }
  }
  p = p.replace(/^\[project\]\//, '').replace(/[+ ]\[[^\]]*\].*$/, '').replace(/\s*\(ecmascript\)$/, '').trim();
  return p && !p.includes('node_modules/') ? p : null;
}

/** A server-side frame (a server component's code, on disk): only `luci serve` can map it. */
export const isServerFrame = (url: string): boolean => /^(about:\/\/React\/Server\/|file:\/\/)/.test(url);

/**
 * A served URL as a path in the project: "http://localhost:5173/src/App.tsx?t=1" -> "src/App.tsx";
 * "/@fs/home/me/app/src/x.tsx" -> "/home/me/app/src/x.tsx" (the bridge makes it relative);
 * "webpack-internal:///(app-pages-browser)/./app/page.tsx" -> "app/page.tsx";
 * "about://React/Server/E:%5Capp%5C.next%5C...js?5" -> "E:\app\.next\...js".
 */
export function projectPath(url: string): string {
  const fromId = moduleIdPath(url);
  if (fromId) return fromId;
  if (url.startsWith('about://React/Server/')) {
    let inner: string;
    try { inner = decodeURIComponent(url.slice('about://React/Server/'.length).replace(/[?#].*$/, '')); } catch { return url; }
    return inner.startsWith('file://') ? projectPath(inner) : inner;
  }
  let p = url.replace(/[?#].*$/, '');
  if (/^(webpack-internal|webpack|turbopack):/.test(p)) {
    return p.replace(/^[a-z-]+:\/*/, '').replace(/^\[project\]\//, '').replace(/^\([^)]*\)\//, '').replace(/^_N_E\//, '').replace(/^\.\//, '');
  }
  if (/^file:\/\//.test(p)) return decodeURIComponent(p.replace(/^file:\/\//, '')).replace(/^\/([A-Za-z]:)/, '$1');
  try {
    const u = new URL(p);
    p = decodeURIComponent(u.pathname);
  } catch { /* already a path */ }
  if (p.startsWith('/@fs/')) return p.slice(4);
  return p.replace(/^\//, '');
}

/** Where a component's file sits when it is a page: pages/, routes/, app/, views/ or screens/. */
export const PAGE_FOLDER = /(^|\/)(pages|routes|app|views|screens)\//;
/** A resolved file that is still library code (a source map pointing into node_modules). */
export const isLibraryFile = (file: string): boolean => /(^|\/)node_modules\/|^_next\/|\.vite\/deps\/|(^|\/)\.next\//.test(file.replace(/\\/g, '/'));

export type FrameResolver = (frame: CodeFrame) => Promise<SourceLocation | null>;
/** Maps server-side frames (the bridge, which can read the server's source maps on disk). */
export type ServerResolver = (frames: CodeFrame[]) => Promise<(SourceLocation | null)[]>;

/**
 * Turn served positions into project positions: browser modules through their source maps (so
 * lines are the ones in the file), server modules through `serverResolve` when it is there, else by
 * the module the address names (file only: the line would be the bundle's).
 */
export function frameResolver(
  mapped: (url: string, line: number, column: number) => Promise<{ source: string; line: number; column: number } | null>,
  serverResolve?: ServerResolver
): FrameResolver {
  return async (frame) => {
    if (isServerFrame(frame.url)) {
      const hit = serverResolve ? (await serverResolve([frame]).catch(() => [null]))[0] : null;
      if (hit) return hit;
      const mod = moduleIdPath(frame.url);
      return mod ? { file: mod } : null;
    }
    const served = projectPath(frame.url);
    const hit = /^https?:/.test(frame.url) && frame.line > 0 ? await mapped(frame.url, frame.line, frame.column ?? 1) : null;
    if (!hit) {
      return {
        file: served,
        ...(frame.line > 0 ? { line: frame.line } : {}),
        ...(frame.column && frame.column > 0 ? { column: frame.column } : {})
      };
    }
    let file = projectPath(hit.source);
    // A map that names the file alone ("Pricing.jsx") or as served: the served path says where it is
    if (!file.includes('/') || served.endsWith(`/${file}`) || served === file) file = served;
    return { file, line: hit.line, column: hit.column };
  };
}

/** The first frame that resolves to the project's own code, tried in order. */
export async function firstUserLocation(frames: readonly CodeFrame[], resolve: FrameResolver): Promise<SourceLocation | undefined> {
  for (const f of frames.slice(0, 6)) {
    const loc = await resolve(f);
    if (loc && !isLibraryFile(loc.file)) return loc;
  }
  return undefined;
}
