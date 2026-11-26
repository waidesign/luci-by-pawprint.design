import { describe, expect, it } from 'vitest';
import { identifyIcon } from '../src/icon.js';

describe('Icon Identification (v0.5, PRD Roadmap Priority 12)', () => {
  function makeElement(html: string): Element {
    // Basic DOM node mock sufficient for identifyIcon
    const tagMatch = /^<([a-z0-9-]+)/i.exec(html);
    const tag = tagMatch ? tagMatch[1]!.toLowerCase() : 'div';
    const classMatch = /class="([^"]+)"/.exec(html);
    const dataLucideMatch = /data-lucide="([^"]+)"/.exec(html);
    const ariaLabelMatch = /aria-label="([^"]+)"/.exec(html);
    const viewBoxMatch = /viewBox="([^"]+)"/.exec(html);
    const pathMatches = [...html.matchAll(/<path[^>]*d="([^"]+)"/g)].map(m => m[1]!);

    const el = {
      tagName: tag,
      getAttribute: (attr: string) => {
        if (attr === 'class') return classMatch ? classMatch[1] : null;
        if (attr === 'data-lucide') return dataLucideMatch ? dataLucideMatch[1] : null;
        if (attr === 'aria-label') return ariaLabelMatch ? ariaLabelMatch[1] : null;
        if (attr === 'viewBox') return viewBoxMatch ? viewBoxMatch[1] : null;
        return null;
      },
      hasAttribute: (attr: string) => {
        if (attr === 'data-radix-icon') return html.includes('data-radix-icon');
        return false;
      },
      querySelector: (sel: string) => {
        if (sel === 'svg' && tag !== 'svg' && html.includes('<svg')) {
          return makeElement(html.slice(html.indexOf('<svg')));
        }
        return null;
      },
      querySelectorAll: (sel: string) => {
        if (sel === 'path') {
          return pathMatches.map(d => ({
            getAttribute: (a: string) => a === 'd' ? d : null
          }));
        }
        return [];
      }
    } as unknown as Element;

    return el;
  }

  it('identifies Lucide icon from data attribute', () => {
    const el = makeElement('<svg data-lucide="arrow-right" viewBox="0 0 24 24"></svg>');
    const icon = identifyIcon(el);
    expect(icon).toEqual({
      set: 'lucide',
      name: 'arrow-right',
      component: 'ArrowRight',
      viewBox: '0 0 24 24'
    });
  });

  it('identifies Lucide icon from class name', () => {
    const el = makeElement('<svg class="lucide lucide-check" viewBox="0 0 24 24"></svg>');
    const icon = identifyIcon(el);
    expect(icon).toEqual({
      set: 'lucide',
      name: 'check',
      component: 'Check',
      viewBox: '0 0 24 24'
    });
  });

  it('identifies Heroicon from class name', () => {
    const el = makeElement('<svg class="heroicon heroicon-chevron-down w-5 h-5"></svg>');
    const icon = identifyIcon(el);
    expect(icon).toEqual({
      set: 'heroicons',
      name: 'chevron-down',
      component: 'ChevronDown',
      viewBox: undefined
    });
  });

  it('identifies FontAwesome icon from <i> tag class', () => {
    const el = makeElement('<i class="fa-solid fa-search"></i>');
    const icon = identifyIcon(el);
    expect(icon).toEqual({
      set: 'fontawesome',
      name: 'search',
      component: 'FaSearch',
      viewBox: undefined
    });
  });

  it('identifies Tabler icon from class name', () => {
    const el = makeElement('<svg class="tabler-icon tabler-icon-plus"></svg>');
    const icon = identifyIcon(el);
    expect(icon).toEqual({
      set: 'tabler',
      name: 'plus',
      component: 'IconPlus',
      viewBox: undefined
    });
  });

  it('identifies Radix icon from class name and aria-label', () => {
    const el = makeElement('<svg class="radix-icon" aria-label="cross-2"></svg>');
    const icon = identifyIcon(el);
    expect(icon).toEqual({
      set: 'radix',
      name: 'cross-2',
      component: 'Cross2',
      viewBox: undefined
    });
  });

  it('identifies unstyled SVG icon by geometry path matching (Lucide check)', () => {
    const el = makeElement('<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"></path></svg>');
    const icon = identifyIcon(el);
    expect(icon).toEqual({
      set: 'lucide',
      name: 'check',
      component: 'Check',
      viewBox: '0 0 24 24'
    });
  });

  it('identifies unstyled SVG icon by geometry path matching (Lucide chevron-down)', () => {
    const el = makeElement('<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"></path></svg>');
    const icon = identifyIcon(el);
    expect(icon).toEqual({
      set: 'lucide',
      name: 'chevron-down',
      component: 'ChevronDown',
      viewBox: '0 0 24 24'
    });
  });

  it('returns null for non-icon elements', () => {
    const el = makeElement('<div class="card"><p>Hello</p></div>');
    expect(identifyIcon(el)).toBeNull();
  });

  it('B-23: distinguishes Lucide plus, minus and arrow-right and avoids false radix check', () => {
    // Lucide plus (2 paths)
    const plusEl = makeElement('<svg viewBox="0 0 24 24"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>');
    expect(identifyIcon(plusEl)).toEqual({
      set: 'lucide',
      name: 'plus',
      component: 'Plus',
      viewBox: '0 0 24 24'
    });

    // Lucide minus
    const minusEl = makeElement('<svg viewBox="0 0 24 24"><path d="M5 12h14"></path></svg>');
    expect(identifyIcon(minusEl)).toEqual({
      set: 'lucide',
      name: 'minus',
      component: 'Minus',
      viewBox: '0 0 24 24'
    });

    // Lucide arrow-right
    const arrowEl = makeElement('<svg viewBox="0 0 24 24"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>');
    expect(identifyIcon(arrowEl)).toEqual({
      set: 'lucide',
      name: 'arrow-right',
      component: 'ArrowRight',
      viewBox: '0 0 24 24'
    });

    // Star icon that touches (12, 2) - should not match radix check
    const starEl = makeElement('<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg>');
    const starIcon = identifyIcon(starEl);
    expect(starIcon?.name).not.toBe('check');
  });
});
