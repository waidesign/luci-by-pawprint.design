/**
 * Stack Detection on External Sites (v0.5, PRD Roadmap Priority 13):
 * Inspects external DOM and window globals to identify the site's framework, router,
 * styling system, and UI component library.
 */
import type { SiteStack } from '@luci-dev/format/capture';

const TAILWIND_PREFIXES = [
  'flex', 'grid', 'inline-flex', 'inline-grid', 'hidden', 'block', 'inline-block',
  'items-', 'justify-', 'content-', 'self-',
  'p-', 'px-', 'py-', 'pt-', 'pb-', 'pl-', 'pr-',
  'm-', 'mx-', 'my-', 'mt-', 'mb-', 'ml-', 'mr-',
  'text-', 'bg-', 'border-', 'rounded-', 'shadow-', 'gap-',
  'w-', 'h-', 'min-w-', 'max-w-', 'min-h-', 'max-h-',
  'transition', 'duration-', 'ease-',
  'hover:', 'focus:', 'active:', 'disabled:', 'dark:',
  'sm:', 'md:', 'lg:', 'xl:', '2xl:', 'space-x-', 'space-y-'
];

function isTailwindClass(cls: string): boolean {
  for (const prefix of TAILWIND_PREFIXES) {
    if (prefix.endsWith('-') || prefix.endsWith(':')) {
      if (cls.startsWith(prefix)) return true;
    } else if (cls === prefix) {
      return true;
    }
  }
  return false;
}

/**
 * Detect the stack of the site (framework, router, styling system, UI library).
 */
export function detectSiteStack(doc?: Document, win?: Window): SiteStack {
  const d = doc ?? (typeof document !== 'undefined' ? document : undefined);
  const w = win ?? (typeof window !== 'undefined' ? window : (d?.defaultView as Window | undefined));

  const signals: string[] = [];
  let framework: string | undefined;
  let router: string | undefined;
  let styling: string | undefined;
  let uiLibrary: string | undefined;

  if (!d) return {};

  const anyWin = (w ?? {}) as Record<string, unknown>;

  // 1. Framework detection
  if (anyWin.__NEXT_DATA__ || d.querySelector('script[src*="/_next/"]') || d.querySelector('#__next') || d.querySelector('next-route-announcer')) {
    framework = 'Next.js';
    signals.push('Next.js globals/scripts');
    const nextData = anyWin.__NEXT_DATA__ as { page?: string } | undefined;
    if (nextData?.page && nextData.page !== '/_error') {
      router = 'Pages Router';
    } else if (anyWin.__next_f || d.querySelector('script[src*="/_next/static/chunks/app/"]') || !nextData) {
      router = 'App Router';
    }
  } else if (anyWin.__remixContext || d.querySelector('script[src*="/build/root-"]') || d.querySelector('script[src*="/build/_shared/"]')) {
    framework = 'Remix';
    signals.push('Remix context');
  } else if (anyWin.__NUXT__ || anyWin.$nuxt || d.querySelector('#__nuxt')) {
    framework = 'Nuxt';
    signals.push('Nuxt DOM/globals');
  } else if (d.querySelector('astro-island') || d.querySelector('astro-slot') || d.querySelector('[data-astro-cid]')) {
    framework = 'Astro';
    signals.push('Astro island components');
  } else if (anyWin.__sveltekit_data || d.querySelector('div[id^="svelte-"]') || d.querySelector('[class*="svelte-"]')) {
    framework = anyWin.__sveltekit_data ? 'SvelteKit' : 'Svelte';
    signals.push('Svelte DOM signatures');
  } else if (anyWin.___gatsby || d.querySelector('#___gatsby')) {
    framework = 'Gatsby';
    signals.push('Gatsby root element');
  } else if (anyWin.__vite_plugin_react_preamble_installed__ || d.querySelector('script[src*="/@vite/client"]')) {
    framework = 'Vite + React';
    signals.push('Vite client script');
  } else if (d.querySelector('[data-reactroot]') || anyWin.React || (d.body && Object.keys(d.body).some(k => k.startsWith('__reactFiber') || k.startsWith('_reactListening')))) {
    framework = 'React';
    signals.push('React root / fiber');
  } else if (anyWin.__VUE__ || d.querySelector('[data-v-]')) {
    framework = 'Vue';
    signals.push('Vue scoped data attribute');
  }

  // 2. Styling System detection
  let tailwindHits = 0;
  let cssModulesHits = 0;
  let styledComponentsHits = 0;
  let emotionHits = 0;

  if (d.querySelector('style[data-styled]') || d.querySelector('[class*="sc-"]')) {
    styledComponentsHits++;
  }
  if (d.querySelector('style[data-emotion]') || d.querySelector('[class*="css-"]')) {
    emotionHits++;
  }

  // Sample elements to test class patterns
  const sampledElements = Array.from(d.querySelectorAll('*')).slice(0, 150);
  for (const el of sampledElements) {
    const classAttr = el.getAttribute('class');
    if (!classAttr) continue;
    const classes = classAttr.split(/\s+/).filter(Boolean);
    for (const c of classes) {
      if (isTailwindClass(c)) tailwindHits++;
      if (/[a-zA-Z0-9]+_[a-zA-Z0-9]+__[a-zA-Z0-9]{4,}/.test(c)) cssModulesHits++;
    }
  }

  const stylingParts: string[] = [];
  if (tailwindHits >= 4) {
    stylingParts.push('Tailwind CSS');
    signals.push(`Tailwind classes (${tailwindHits} tokens)`);
  }
  if (cssModulesHits >= 2) {
    stylingParts.push('CSS Modules');
    signals.push('CSS Modules hashed classes');
  }
  if (styledComponentsHits > 0) {
    stylingParts.push('Styled Components');
    signals.push('Styled Components tags/classes');
  }
  if (emotionHits > 0 && styledComponentsHits === 0) {
    stylingParts.push('Emotion');
    signals.push('Emotion tags/classes');
  }

  styling = stylingParts.join(', ') || undefined;

  // 3. UI Library detection
  if (d.querySelector('[data-radix-collection-item]') || d.querySelector('[data-radix-portal]') || d.querySelector('[data-slot]') || d.querySelector('[data-state="open"],[data-state="closed"]')) {
    uiLibrary = 'Shadcn UI / Radix';
    signals.push('Radix/Shadcn data attributes');
  } else if (d.querySelector('[class*="MuiButton-"]') || d.querySelector('[class*="MuiTypography-"]') || d.querySelector('[class*="Mui-"]')) {
    uiLibrary = 'Material UI (MUI)';
    signals.push('MUI component classes');
  } else if (d.querySelector('[class*="chakra-"]')) {
    uiLibrary = 'Chakra UI';
    signals.push('Chakra UI class prefixes');
  } else if (d.querySelector('[class*="ant-"]')) {
    uiLibrary = 'Ant Design';
    signals.push('Ant Design class prefixes');
  }

  return {
    ...(framework ? { framework } : {}),
    ...(router ? { router } : {}),
    ...(styling ? { styling } : {}),
    ...(uiLibrary ? { uiLibrary } : {}),
    ...(signals.length ? { signals } : {})
  };
}
