/**
 * Icon Identification (v0.5, PRD Roadmap Priority 12):
 * Recognizes standard SVG icon sets and names (Lucide, Heroicons, Radix, FontAwesome, Tabler)
 * by class/attribute heuristics and SVG geometry path matching.
 */
import type { IconInfo } from '@luci-dev/format/capture';

function toPascalCase(str: string): string {
  return str
    .split(/[-_]+/)
    .filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join('');
}

function cleanPath(d: string): string {
  return d
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Known geometry signatures for common icon paths. */
const GEOMETRY_SIGNATURES: Array<{
  set: IconInfo['set'];
  name: string;
  matches: (paths: string[], viewBox?: string) => boolean;
}> = [
  {
    set: 'lucide',
    name: 'check',
    matches: paths => paths.some(p => p.includes('20 6 9 17') || p.includes('20 6l-11 11') || p.includes('m20 6-11 11-5-5') || p.includes('m20 6 9 17l-5-5'))
  },
  {
    set: 'heroicons',
    name: 'check',
    matches: paths => paths.some(p => p.includes('4.5 12.75') && p.includes('9-13.5'))
  },
  {
    set: 'radix',
    name: 'check',
    matches: paths => paths.some(p => p.includes('12 2') || p.includes('m12 2l-7 7-3-3'))
  },
  {
    set: 'lucide',
    name: 'x',
    matches: paths => paths.some(p => p.includes('18 6 6 18') || (p.includes('18 6') && p.includes('6 18')))
  },
  {
    set: 'heroicons',
    name: 'x-mark',
    matches: paths => paths.some(p => p.includes('6 18l18 6') || p.includes('6 18 18 6'))
  },
  {
    set: 'lucide',
    name: 'chevron-down',
    matches: paths => paths.some(p => p.includes('6 9 6 6 6-6') || p.includes('m6 9 6 6 6-6'))
  },
  {
    set: 'heroicons',
    name: 'chevron-down',
    matches: paths => paths.some(p => p.includes('19.5 8.25') && p.includes('7.5 7.5'))
  },
  {
    set: 'lucide',
    name: 'chevron-right',
    matches: paths => paths.some(p => p.includes('9 18 6-6-6-6') || p.includes('m9 18 6-6-6-6'))
  },
  {
    set: 'heroicons',
    name: 'chevron-right',
    matches: paths => paths.some(p => p.includes('8.25 4.5') && p.includes('7.5 7.5'))
  },
  {
    set: 'lucide',
    name: 'chevron-left',
    matches: paths => paths.some(p => p.includes('15 18-6-6 6-6') || p.includes('m15 18-6-6 6-6'))
  },
  {
    set: 'lucide',
    name: 'chevron-up',
    matches: paths => paths.some(p => p.includes('18 15-6-6-6 6') || p.includes('m18 15-6-6-6 6'))
  },
  {
    set: 'lucide',
    name: 'arrow-right',
    matches: paths => paths.some(p => p.includes('5 12h14') || (p.includes('12 5') && p.includes('7-7-7-7')))
  },
  {
    set: 'heroicons',
    name: 'arrow-right',
    matches: paths => paths.some(p => p.includes('13.5 4.5l7.5 7.5') && p.includes('21 12h3'))
  },
  {
    set: 'lucide',
    name: 'arrow-left',
    matches: paths => paths.some(p => p.includes('19 12h5') || (p.includes('12 19') && p.includes('7-7 7-7')))
  },
  {
    set: 'lucide',
    name: 'search',
    matches: paths => paths.some(p => p.includes('21 21-4.3-4.3') || p.includes('m21 21-4.35-4.35'))
  },
  {
    set: 'lucide',
    name: 'menu',
    matches: paths => paths.some(p => p.includes('4 12h16') && p.includes('4 6h16'))
  },
  {
    set: 'heroicons',
    name: 'bars-3',
    matches: paths => paths.some(p => p.includes('3.75 6.75h16.5') && p.includes('3.75 12h16.5'))
  },
  {
    set: 'lucide',
    name: 'plus',
    matches: paths => paths.some(p => p.includes('5 12h14') && p.includes('12 5v14'))
  },
  {
    set: 'lucide',
    name: 'minus',
    matches: paths => paths.some(p => p.includes('5 12h14'))
  }
];

/** Extract path definitions from an SVG element. */
function getSvgPaths(svg: Element): string[] {
  const paths: string[] = [];
  const pathElements = svg.querySelectorAll('path');
  for (const p of Array.from(pathElements)) {
    const d = p.getAttribute('d');
    if (d) paths.push(cleanPath(d));
  }
  return paths;
}

/**
 * Identify an SVG icon element by its class/attributes or by path geometry.
 */
export function identifyIcon(element: Element): IconInfo | null {
  const svg = element.tagName.toLowerCase() === 'svg' ? element : element.querySelector('svg');
  if (!svg && element.tagName.toLowerCase() !== 'i') return null;

  const target = svg ?? element;
  const className = (target.getAttribute('class') || '').toLowerCase();
  const dataLucide = target.getAttribute('data-lucide');
  const ariaLabel = (target.getAttribute('aria-label') || '').toLowerCase();
  const viewBox = svg?.getAttribute('viewBox') ?? undefined;

  // 1. Direct Lucide data attribute
  if (dataLucide) {
    return {
      set: 'lucide',
      name: dataLucide.toLowerCase(),
      component: toPascalCase(dataLucide),
      viewBox
    };
  }

  // 2. Lucide class naming (e.g. "lucide lucide-check" or "lucide-check")
  const lucideMatch = /lucide-([a-z0-9-]+)/.exec(className);
  if (lucideMatch && lucideMatch[1]) {
    return {
      set: 'lucide',
      name: lucideMatch[1],
      component: toPascalCase(lucideMatch[1]),
      viewBox
    };
  }

  // 3. Heroicons class naming (e.g. "heroicon heroicon-check" or "h-5 w-5")
  const heroMatch = /heroicon-([a-z0-9-]+)/.exec(className);
  if (heroMatch && heroMatch[1]) {
    return {
      set: 'heroicons',
      name: heroMatch[1],
      component: toPascalCase(heroMatch[1]),
      viewBox
    };
  }

  // 4. FontAwesome class naming (e.g. "fa-solid fa-check", "fas fa-check", "fa-check")
  const faMatch = /\bfa(?:-[a-z]+)?\s+fa-([a-z0-9-]+)/.exec(className) ?? /\bfa-([a-z0-9-]+)/.exec(className);
  if (faMatch && faMatch[1] && !['solid', 'regular', 'light', 'thin', 'duotone', 'brands', '2x', '3x', 'lg', 'sm', 'fw'].includes(faMatch[1])) {
    return {
      set: 'fontawesome',
      name: faMatch[1],
      component: `Fa${toPascalCase(faMatch[1])}`,
      viewBox
    };
  }

  // 5. Tabler icon class naming (e.g. "tabler-icon tabler-icon-check")
  const tablerMatch = /tabler-icon-([a-z0-9-]+)/.exec(className);
  if (tablerMatch && tablerMatch[1]) {
    return {
      set: 'tabler',
      name: tablerMatch[1],
      component: `Icon${toPascalCase(tablerMatch[1])}`,
      viewBox
    };
  }

  // 6. Radix icon attribute or class
  if (className.includes('radix-icon') || target.hasAttribute('data-radix-icon')) {
    const name = ariaLabel || 'icon';
    return {
      set: 'radix',
      name,
      component: toPascalCase(name),
      viewBox
    };
  }

  // 7. SVG Geometry Matching
  if (svg) {
    const paths = getSvgPaths(svg);
    if (paths.length) {
      for (const sig of GEOMETRY_SIGNATURES) {
        if (sig.matches(paths, viewBox)) {
          return {
            set: sig.set,
            name: sig.name,
            component: toPascalCase(sig.name),
            viewBox
          };
        }
      }
    }
  }

  // 8. Fallback for identifiable aria-label on SVG
  if (ariaLabel && ariaLabel.length < 30) {
    return {
      set: 'custom',
      name: ariaLabel.replace(/\s+/g, '-'),
      component: toPascalCase(ariaLabel),
      viewBox
    };
  }

  return null;
}
