/**
 * The Vue 3 adapter (FR25, v0.3.6): from a DOM element, the Vue components around it and their
 * `.vue` source files. In development, Vue 3 attaches `__vueParentComponent` to every element it
 * mounts, and Vite (`@vitejs/plugin-vue`) sets `__file` and `__name` on each component's definition
 * (`instance.type`). Walking `.parent` up the component tree yields the full hierarchy from page
 * shell to leaf component, with no Vue runtime imported by Luci.
 */
import { MAX_COMPONENTS, isLibraryFile, projectPath, type CodeFrame, type FrameworkInfo } from './react.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type VueInstance = any;

const VUE_BUILTINS = new Set([
  'BaseTransition', 'Transition', 'TransitionGroup', 'KeepAlive', 'Teleport', 'Suspense',
  'RouterView', 'RouterLink', 'NuxtPage', 'NuxtLayout', 'ClientOnly'
]);

/** Vue 3's component instance on a DOM element, or null when Vue did not render it. */
export function vueInstanceOf(el: Element): VueInstance | null {
  const inst = (el as unknown as { __vueParentComponent?: VueInstance }).__vueParentComponent;
  return inst && typeof inst === 'object' && 'type' in inst ? inst : null;
}

/** The nearest element (itself or an ancestor) with a Vue 3 component instance. */
export function nearestVueInstance(el: Element): VueInstance | null {
  for (let n: Element | null = el; n; n = n.parentElement) {
    const inst = vueInstanceOf(n);
    if (inst) return inst;
  }
  return null;
}

function nameFromFile(file: string): string | null {
  const clean = projectPath(file).replace(/\\/g, '/').replace(/\.vue$/i, '');
  const parts = clean.split('/').filter(Boolean);
  const base = parts.at(-1);
  if (!base) return null;
  if (/^(index|\+?page|\+?layout)$/i.test(base) && parts.length >= 2) {
    const folder = parts.at(-2)!;
    return folder.charAt(0).toUpperCase() + folder.slice(1);
  }
  return base;
}

/** A Vue component's display name from `type.__name`, `type.name`, `type.displayName` or `type.__file`. */
export function vueComponentName(instance: VueInstance): string | null {
  const type = instance?.type;
  if (!type || typeof type !== 'object') return null;
  const raw = type.__name ?? type.name ?? type.displayName;
  const name = typeof raw === 'string' && raw.trim() ? raw.trim() : typeof type.__file === 'string' ? nameFromFile(type.__file) : null;
  if (!name || VUE_BUILTINS.has(name)) return null;
  return name;
}

function framesOfVueInstance(instance: VueInstance, el?: Element): CodeFrame[] {
  const file = instance?.type?.__file;
  if (typeof file !== 'string' || !file || isLibraryFile(file)) return [];
  // If a template transform attached a vnode location, keep its 1-based line
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vnodeLoc = (el as any)?.__vnode?.loc?.start ?? instance?.subTree?.loc?.start;
  const line = typeof vnodeLoc?.line === 'number' && vnodeLoc.line > 0 ? vnodeLoc.line : 0;
  const column = typeof vnodeLoc?.column === 'number' && vnodeLoc.column > 0 ? vnodeLoc.column : undefined;
  return [{ url: file, line, ...(column ? { column } : {}) }];
}

/**
 * Vue 3 components around an element (outermost first) and their `.vue` files.
 */
export function vueInfo(el: Element): FrameworkInfo | null {
  const host = nearestVueInstance(el);
  if (!host) return null;

  const chain: VueInstance[] = [];
  const seen = new Set<VueInstance>();
  for (let cur: VueInstance | null = host; cur && !seen.has(cur) && chain.length < 50; cur = cur.parent ?? null) {
    seen.add(cur);
    chain.push(cur);
  }

  const named: { name: string; frames: CodeFrame[] }[] = [];
  for (let i = 0; i < chain.length; i++) {
    const inst = chain[i]!;
    const file = inst?.type?.__file;
    if (typeof file === 'string' && isLibraryFile(file)) continue;
    const name = vueComponentName(inst);
    if (!name) continue;
    const frames = framesOfVueInstance(inst, i === 0 ? el : undefined);
    named.push({ name, frames });
  }

  if (!named.length) return null;
  named.reverse();
  const kept = named.slice(-MAX_COMPONENTS);
  const frames = [...kept].reverse().flatMap(n => n.frames);
  return {
    framework: 'vue',
    components: kept.map(n => n.name),
    frames,
    componentFrames: kept.map(n => n.frames)
  };
}
