import { describe, expect, it } from 'vitest';
import { detectSiteStack } from '../src/stack.js';

describe('Stack Detection on External Sites (v0.5, PRD Roadmap Priority 13)', () => {
  function makeMockDoc(options: {
    html?: string;
    globals?: Record<string, unknown>;
  } = {}): { doc: Document; win: Window } {
    const html = options.html ?? '';
    const globals = options.globals ?? {};

    const doc = {
      querySelector: (sel: string) => {
        if (sel === 'script[src*="/_next/"]' && html.includes('_next')) return {};
        if (sel === 'script[src*="/build/root-"]' && html.includes('/build/root-')) return {};
        if (sel === '#__next' && html.includes('id="__next"')) return {};
        if (sel === '#__nuxt' && html.includes('id="__nuxt"')) return {};
        if (sel === 'astro-island' && html.includes('<astro-island')) return {};
        if (sel === 'div[id^="svelte-"]' && html.includes('id="svelte-')) return {};
        if (sel === '[data-reactroot]' && html.includes('data-reactroot')) return {};
        if (sel.includes('data-radix') && html.includes('data-radix')) return {};
        if (sel.includes('data-slot') && html.includes('data-slot')) return {};
        if (sel.includes('Mui') && html.includes('Mui')) return {};
        if (sel.includes('chakra') && html.includes('chakra')) return {};
        return null;
      },
      querySelectorAll: (sel: string) => {
        if (sel === '*') {
          const classMatches = [...html.matchAll(/class="([^"]+)"/g)].map(m => m[1]!);
          return classMatches.map(cls => ({
            getAttribute: (a: string) => a === 'class' ? cls : null
          }));
        }
        return [];
      },
      body: {}
    } as unknown as Document;

    const win = {
      ...globals,
      document: doc
    } as unknown as Window;

    return { doc, win };
  }

  it('detects Next.js (App Router) + Tailwind CSS + Shadcn UI', () => {
    const { doc, win } = makeMockDoc({
      html: `
        <div id="root">
          <script src="/_next/static/chunks/app/layout.js"></script>
          <button class="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors bg-primary text-white h-10 px-4 py-2" data-slot="button" data-radix-collection-item>
            Click me
          </button>
        </div>
      `,
      globals: {
        __next_f: []
      }
    });

    const stack = detectSiteStack(doc, win);
    expect(stack.framework).toBe('Next.js');
    expect(stack.router).toBe('App Router');
    expect(stack.styling).toContain('Tailwind CSS');
    expect(stack.uiLibrary).toBe('Shadcn UI / Radix');
    expect(stack.signals).toBeDefined();
    expect(stack.signals?.length).toBeGreaterThan(0);
  });

  it('detects Next.js (Pages Router) from __NEXT_DATA__', () => {
    const { doc, win } = makeMockDoc({
      globals: {
        __NEXT_DATA__: {
          page: '/pricing',
          buildId: '123'
        }
      }
    });

    const stack = detectSiteStack(doc, win);
    expect(stack.framework).toBe('Next.js');
    expect(stack.router).toBe('Pages Router');
  });

  it('detects Remix stack from globals', () => {
    const { doc, win } = makeMockDoc({
      globals: {
        __remixContext: { state: {} }
      }
    });

    const stack = detectSiteStack(doc, win);
    expect(stack.framework).toBe('Remix');
  });

  it('detects Astro island components', () => {
    const { doc, win } = makeMockDoc({
      html: '<astro-island component-url="/Island.js"></astro-island>'
    });

    const stack = detectSiteStack(doc, win);
    expect(stack.framework).toBe('Astro');
  });

  it('detects SvelteKit from globals and DOM', () => {
    const { doc, win } = makeMockDoc({
      globals: {
        __sveltekit_data: {}
      }
    });

    const stack = detectSiteStack(doc, win);
    expect(stack.framework).toBe('SvelteKit');
  });

  it('detects Material UI (MUI) components', () => {
    const { doc, win } = makeMockDoc({
      html: '<button class="MuiButton-root MuiButton-contained MuiButton-primary">MUI Button</button>'
    });

    const stack = detectSiteStack(doc, win);
    expect(stack.uiLibrary).toBe('Material UI (MUI)');
  });

  it('returns empty object when no framework or library signals are present', () => {
    const { doc, win } = makeMockDoc({
      html: '<div class="custom-wrapper"><p>Plain content</p></div>'
    });

    const stack = detectSiteStack(doc, win);
    expect(stack.framework).toBeUndefined();
    expect(stack.uiLibrary).toBeUndefined();
  });
});
