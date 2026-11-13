/**
 * The React adapter (FR25): from a DOM element, the components around it and where its JSX is
 * written. React keeps a fiber on every element it renders (a "__reactFiber$..." property). In
 * development each fiber knows the component that created it (`_debugOwner`) and where: React 19
 * keeps the stack of that moment (`_debugStack`), React 18 and older the JSX location
 * (`_debugSource`). Luci never imports React: it reads what the page already has. In a production
 * build none of this exists, and the item keeps its selector and text only.
 */
import type { SourceLocation } from '@luci/format/feedback';

/** A position in served code, as a stack trace or `_debugSource` gives it. */
export interface CodeFrame {
  url: string;
  line: number;
  column?: number;
}

/** What an adapter found around an element. */
export interface FrameworkInfo {
  framework: string;
  /** Components around the element, outermost first. */
  components: string[];
  /** Where the element's own JSX is (served code; see resolveFrame). */
  frame?: CodeFrame;
  /** Where each component's own JSX is, by position in `components`. */
  componentFrames: (CodeFrame | undefined)[];
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

/** A component's name: displayName, then the function's name; forwardRef and memo look inside. */
export function componentName(fiber: Fiber): string | null {
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

/** Library code in a stack frame: React itself, the dev server's pre-bundled dependencies, framework runtimes. */
const LIBRARY = /\/node_modules\/|\/\.vite\/deps\/|\/@react-refresh|\/@vite\/|\/_next\/static\/chunks\/(webpack|framework|main-app)|react-stack-|webpack\/runtime/;

/** Frames of a stack trace, as `at Name (url:line:col)` or `at url:line:col` (Chrome) or `Name@url:line:col` (Firefox, Safari). */
export function stackFrames(stack: string): CodeFrame[] {
  const out: CodeFrame[] = [];
  for (const line of stack.split('\n')) {
    const m = /\(?((?:https?|file|webpack-internal|webpack|turbopack):\/\/?[^\s()]*?):(\d+):(\d+)\)?\s*$/.exec(line.trim());
    if (m) out.push({ url: m[1]!, line: Number(m[2]), column: Number(m[3]) });
  }
  return out;
}

/** Where a fiber was created: the first frame outside library code, or React 18's JSX location. */
export function creationFrame(fiber: Fiber): CodeFrame | undefined {
  const stack = fiber?._debugStack?.stack;
  if (typeof stack === 'string') {
    const frame = stackFrames(stack).find(f => !LIBRARY.test(f.url));
    if (frame) return frame;
  }
  const src = fiber?._debugSource;
  if (src && typeof src.fileName === 'string') return { url: src.fileName, line: Number(src.lineNumber) || 1, ...(src.columnNumber ? { column: Number(src.columnNumber) } : {}) };
  return undefined;
}

/** At most this many components, innermost kept (the outer ones are the app's shell). */
export const MAX_COMPONENTS = 8;

/**
 * Components around an element and where each one's JSX is. The owner chain is used (who created
 * whom), so library wrappers that only pass elements through (routers, providers) stay out; when a
 * build has no owners, the parent chain is used instead.
 */
export function reactInfo(el: Element): FrameworkInfo | null {
  const host = nearestFiber(el);
  if (!host) return null;
  // Innermost first: the element's fiber, then each owner
  const chain: Fiber[] = [host];
  const seen = new Set<Fiber>([host]);
  for (let o = host._debugOwner; o && !seen.has(o) && chain.length < 50; o = o._debugOwner) { chain.push(o); seen.add(o); }
  if (chain.length === 1) {
    for (let p = host.return; p && chain.length < 50; p = p.return) if (componentName(p)) chain.push(p);
  }
  // A component's own JSX is where the next fiber inward was created
  const named: { name: string; frame: CodeFrame | undefined }[] = [];
  for (let i = 1; i < chain.length; i++) {
    const name = componentName(chain[i]);
    if (name) named.push({ name, frame: creationFrame(chain[i - 1]) });
  }
  named.reverse();
  const kept = named.slice(-MAX_COMPONENTS);
  const frame = creationFrame(host);
  return { framework: 'react', components: kept.map(n => n.name), ...(frame ? { frame } : {}), componentFrames: kept.map(n => n.frame) };
}

/**
 * A served URL as a path in the project: "http://localhost:5173/src/App.tsx?t=1" -> "src/App.tsx";
 * "/@fs/home/me/app/src/x.tsx" -> "/home/me/app/src/x.tsx" (the bridge makes it relative);
 * "webpack-internal:///(app-pages-browser)/./app/page.tsx" -> "app/page.tsx".
 */
export function projectPath(url: string): string {
  let p = url.replace(/[?#].*$/, '');
  if (/^(webpack-internal|webpack|turbopack):/.test(p)) {
    p = p.replace(/^[a-z-]+:\/*/, '').replace(/^\[project\]\//, '').replace(/^\([^)]*\)\//, '').replace(/^_N_E\//, '').replace(/^\.\//, '');
    return p;
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

export type FrameResolver = (frame: CodeFrame) => Promise<SourceLocation>;

/**
 * Turn served positions into project positions through the module's source map (when it has one),
 * so lines are the ones in the file.
 */
export function frameResolver(mapped: (url: string, line: number, column: number) => Promise<{ source: string; line: number; column: number } | null>): FrameResolver {
  return async (frame) => {
    const served = projectPath(frame.url);
    const hit = /^https?:/.test(frame.url) ? await mapped(frame.url, frame.line, frame.column ?? 1) : null;
    if (!hit) return { file: served, line: frame.line, ...(frame.column ? { column: frame.column } : {}) };
    let file = projectPath(hit.source);
    // A map that names the file alone ("Pricing.jsx") or as served: the served path says where it is
    if (!file.includes('/') || served.endsWith(`/${file}`) || served === file) file = served;
    return { file, line: hit.line, column: hit.column };
  };
}
