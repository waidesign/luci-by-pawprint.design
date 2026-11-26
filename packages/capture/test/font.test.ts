import { describe, expect, it } from 'vitest';
import { identifyFont, isGoogleFont, googleFontUrl } from '../src/font.js';

describe('Font Identification (v0.5, PRD Roadmap Priority 12)', () => {
  it('identifies Google Font and generates valid CSS2 import URL', () => {
    const res = identifyFont('Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif');
    expect(res.rendered).toBe('Inter');
    expect(res.googleFont).toBe(true);
    expect(res.importUrl).toBe('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  });

  it('correctly handles non-Google fonts without import URL', () => {
    const res = identifyFont('"Custom Brand Font", Helvetica, Arial, sans-serif');
    expect(res.rendered).toBe('Custom Brand Font');
    expect(res.googleFont).toBeUndefined();
    expect(res.importUrl).toBeUndefined();
  });

  it('uses document.fonts.check when available to detect rendered font in fallback stack', () => {
    const fakeWin = {
      document: {
        fonts: {
          check: (fontSpec: string) => fontSpec.includes('Roboto')
        },
        querySelectorAll: () => []
      }
    } as unknown as Window;

    const res = identifyFont('"Missing Webfont", Roboto, Arial, sans-serif', fakeWin);
    expect(res.rendered).toBe('Roboto');
    expect(res.googleFont).toBe(true);
  });

  it('detects Google Fonts loaded via link tag in document', () => {
    const fakeDoc = {
      querySelectorAll: (sel: string) => {
        if (sel.includes('fonts.googleapis.com')) {
          return [{
            getAttribute: (attr: string) => attr === 'href' ? 'https://fonts.googleapis.com/css2?family=Special+Elite&display=swap' : null
          }];
        }
        return [];
      }
    } as unknown as Document;

    expect(isGoogleFont('Special Elite', fakeDoc)).toBe(true);
    expect(googleFontUrl('Special Elite')).toContain('family=Special+Elite');

    // B-24: multi-family Google Fonts URL recognizes 2nd+ family
    const multiFamilyDoc = {
      querySelectorAll: (sel: string) => {
        if (sel.includes('fonts.googleapis.com')) {
          return [{
            getAttribute: (attr: string) => attr === 'href' ? 'https://fonts.googleapis.com/css2?family=Inter&family=Chivo:wght@400;700&display=swap' : null
          }];
        }
        return [];
      }
    } as unknown as Document;
    expect(isGoogleFont('Chivo', multiFamilyDoc)).toBe(true);
  });

  it('handles empty or pure generic font stacks', () => {
    expect(identifyFont('').rendered).toBe('sans-serif');
    expect(identifyFont('monospace').rendered).toBe('monospace');
  });
});
