/**
 * The Svelte 4/5 adapter (FR25, v0.3.6): from a DOM element, the Svelte components around it and
 * the exact `.svelte` file and line where the element was written. In development (`compile(...,
 * { dev: true })`), Svelte attaches `__svelte_meta` to every element with `loc: { file, line,
 * column }` (and in Svelte 5 a `parent` dev-stack chain of enclosing components; in Svelte 4 the
 * enclosing components sit on ancestor DOM elements). Luci reads those properties directly without
 * importing Svelte.
 */
import { MAX_COMPONENTS, isLibraryFile, projectPath, type CodeFrame, type FrameworkInfo } from './react.js';

export interface SvelteLoc {
  file: string;
  line?: number;
  column?: number;
  /** Present in Svelte 4, where `line` is 0-based. */
  char?: number;
}

export interface SvelteStackEntry {
  type?: string;
  file?: string;
  line?: number;
  column?: number;
  componentTag?: string;
  parent?: SvelteStackEntry | null;
}

export interface SvelteMeta {
  loc?: SvelteLoc;
  parent?: SvelteStackEntry | null;
}

/** Svelte's development metadata on a DOM element, or null when Svelte did not render it. */
export function svelteMetaOf(el: Element): SvelteMeta | null {
  const meta = (el as unknown as { __svelte_meta?: SvelteMeta }).__svelte_meta;
  return meta && typeof meta === 'object' && typeof meta.loc?.file === 'string' && meta.loc.file ? meta : null;
}

/** The nearest element (itself or an ancestor) with Svelte development metadata. */
export function nearestSvelteMeta(el: Element): { el: Element; meta: SvelteMeta } | null {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const meta = svelteMetaOf(n);
    if (meta) return { el: n, meta };
  }
  return null;
}

/** Component name from a `.svelte` path ("src/components/PlanCard.svelte" -> "PlanCard", "src/routes/pricing/+page.svelte" -> "Pricing"). */
export function svelteComponentName(file: string, tag?: string): string | null {
  const clean = projectPath(file).replace(/\\/g, '/').replace(/\.svelte$/i, '');
  const parts = clean.split('/').filter(Boolean);
  const base = parts.at(-1);
  if (!base) return tag && /^[A-Z_$]/.test(tag) ? tag : null;
  if (/^(index|\+page|\+layout|\+error|page)(@.*)?$/i.test(base)) {
    const folder = parts.length >= 2 ? parts.at(-2)! : base.replace(/^\+/, '');
    const cleanFolder = folder.replace(/^\[+\.*|\]+$/g, '');
    if (cleanFolder && !/^(routes|pages|views|screens|components|lib|ui|shared|src|app)$/i.test(cleanFolder)) {
      return cleanFolder.charAt(0).toUpperCase() + cleanFolder.slice(1);
    }
    if (tag && /^[A-Z_$]/.test(tag)) return tag;
    return base.replace(/^\+/, '').replace(/(@.*)?$/, '').replace(/^./, c => c.toUpperCase());
  }
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function frameFromLoc(loc: SvelteLoc): CodeFrame {
  // Svelte 5 uses 1-based lines; Svelte 4 attaches `char` and uses 0-based lines
  const rawLine = typeof loc.line === 'number' ? (typeof loc.char === 'number' || loc.line === 0 ? loc.line + 1 : loc.line) : 0;
  const line = rawLine > 0 ? rawLine : 0;
  const column = typeof loc.column === 'number' && loc.column > 0 ? loc.column : undefined;
  return { url: loc.file, line, ...(column ? { column } : {}) };
}

/**
 * Svelte 4/5 components around an element (outermost first), the element's `.svelte` file and line,
 * and each enclosing component's location.
 */
export function svelteInfo(el: Element): FrameworkInfo | null {
  const hit = nearestSvelteMeta(el);
  if (!hit || !hit.meta.loc) return null;

  // Innermost first: the element's own component, then enclosing components
  const chain: { name: string; file: string; frame: CodeFrame }[] = [];
  const pushFile = (file: string, frame: CodeFrame, tag?: string) => {
    if (!file || isLibraryFile(file)) return;
    const norm = projectPath(file);
    if (chain.at(-1)?.file === norm) return;
    const name = svelteComponentName(file, tag);
    if (!name) return;
    const prev = chain.findIndex(c => c.file === norm);
    if (prev !== -1) {
      if (prev === 0) return;
      chain.splice(prev, 1);
    }
    chain.push({ name, file: norm, frame });
  };

  const ownFrame = frameFromLoc(hit.meta.loc);
  // In Svelte 5, the immediate parent entry in dev_stack (if type === 'component') names this component in `componentTag`
  const ownTag = hit.meta.parent?.type === 'component' ? hit.meta.parent.componentTag : undefined;
  pushFile(hit.meta.loc.file, ownFrame, ownTag);

  // 1. Svelte 5 dev_stack (`meta.parent` chain)
  if (hit.meta.parent) {
    let cur: SvelteStackEntry | null | undefined = hit.meta.parent;
    let steps = 0;
    while (cur && steps < 50) {
      steps++;
      const nextParent: SvelteStackEntry | null | undefined = cur.parent;
      if (typeof cur.file === 'string' && cur.file) {
        const line = typeof cur.line === 'number' && cur.line > 0 ? cur.line : 0;
        const column = typeof cur.column === 'number' && cur.column > 0 ? cur.column : undefined;
        const parentTag = nextParent?.type === 'component' ? nextParent.componentTag : undefined;
        pushFile(cur.file, { url: cur.file, line, ...(column ? { column } : {}) }, parentTag);
      }
      cur = nextParent;
    }
  } else {
    // 2. Svelte 4 (or DOM-only metadata): walk up ancestor DOM elements
    for (let p = hit.el.parentElement; p && chain.length < 50; p = p.parentElement) {
      const m = svelteMetaOf(p);
      if (m?.loc) pushFile(m.loc.file, frameFromLoc(m.loc));
    }
  }

  if (!chain.length) return null;
  const ordered = [...chain].reverse().slice(-MAX_COMPONENTS);
  const frames = [...ordered].reverse().map(c => c.frame);
  return {
    framework: 'svelte',
    components: ordered.map(c => c.name),
    frames,
    componentFrames: ordered.map(c => [c.frame])
  };
}
