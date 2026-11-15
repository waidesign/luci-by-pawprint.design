import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  type Capture,
  type CaptureSettings,
  type ColorSystem,
  type SpacingSystem,
  type SystemCapture,
  type TypographySystem
} from '@luci-dev/format/capture';
import { crawlSite, resolveCrawlUrl, launchCrawlerBrowser, initProject } from '../src/index.js';
import { tempProject } from './helpers.js';
import { serveSites } from '../../capture/test/browser.js';

const captureDir = fileURLToPath(new URL('../../format/fixtures/capture/', import.meta.url));
const mergeDir = fileURLToPath(new URL('../../format/fixtures/merge/', import.meta.url));
const text = (file: string) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const pageInputs = JSON.parse(text(path.join(captureDir, 'inputs.json'))) as Record<string, { capture: Capture }>;
const mergeInputs = JSON.parse(text(path.join(mergeDir, 'inputs.json'))) as Record<string, { settings: CaptureSettings; base: string; others: SystemCapture[] }>;

const typoPricing = pageInputs['example-com.system.typography.design.md']!.capture as TypographySystem;
const typoBlog = mergeInputs['example-com.system.site-typography.design.md']!.others[0]! as TypographySystem;
const colorPricing = pageInputs['example-com.system.color.design.md']!.capture as ColorSystem;
const colorBlog = mergeInputs['example-com.system.site-color.design.md']!.others[0]! as ColorSystem;
const spacingPricing = pageInputs['example-com.system.spacing.design.md']!.capture as SpacingSystem;
const spacingBlog = mergeInputs['example-com.system.site-spacing.design.md']!.others[0]! as SpacingSystem;

describe('resolveCrawlUrl (v0.4.2)', () => {
  it('preserves absolute URLs', () => {
    expect(resolveCrawlUrl('https://example.com/')).toBe('https://example.com/');
    expect(resolveCrawlUrl('http://localhost:3000/pricing')).toBe('http://localhost:3000/pricing');
    expect(resolveCrawlUrl('  https://test.org/app  ')).toBe('https://test.org/app');
  });

  it('resolves relative routes against base URL', () => {
    expect(resolveCrawlUrl('/pricing', 'http://localhost:3000')).toBe('http://localhost:3000/pricing');
    expect(resolveCrawlUrl('pricing', 'http://localhost:3000/')).toBe('http://localhost:3000/pricing');
    expect(resolveCrawlUrl('/blog/post-1', 'http://localhost:3000/app')).toBe('http://localhost:3000/blog/post-1');
  });

  it('throws helpful error when relative route has no base URL', () => {
    expect(() => resolveCrawlUrl('/pricing')).toThrow(/requires a base URL/);
  });
});

describe('crawlSite: multi-page crawl and merge (v0.4.2)', () => {
  it('throws if no URLs provided', async () => {
    await expect(crawlSite({ urls: [] })).rejects.toThrow(/Provide at least one URL/);
  });

  it('crawls multiple pages using pageFetcher, unifies systems, and detects conflicts', async () => {
    const projectDir = tempProject();
    await initProject(projectDir);

    const progressLog: string[] = [];

    const res = await crawlSite({
      urls: ['/pricing', '/blog'],
      base: 'https://example.com',
      projectRoot: projectDir,
      stitch: true,
      onProgress: (p) => {
        progressLog.push(`${p.status}:${p.url}`);
      },
      pageFetcher: async (url: string) => {
        if (url === 'https://example.com/pricing') {
          return { typography: typoPricing, color: colorPricing, spacing: spacingPricing };
        }
        if (url === 'https://example.com/blog') {
          return { typography: typoBlog, color: colorBlog, spacing: spacingBlog };
        }
        throw new Error(`Unknown URL: ${url}`);
      }
    });

    expect(res.site).toBe('example.com');
    expect(res.pages).toEqual(['https://example.com/pricing', 'https://example.com/blog']);
    expect(res.crawled).toHaveLength(2);
    expect(res.crawled.every(c => !c.error)).toBe(true);

    // Progress updates received
    expect(progressLog).toContain('crawling:https://example.com/pricing');
    expect(progressLog).toContain('done:https://example.com/pricing');
    expect(progressLog).toContain('crawling:https://example.com/blog');
    expect(progressLog).toContain('done:https://example.com/blog');

    // Typography merged
    expect(res.typography).not.toBeNull();
    expect(res.typography!.families.length).toBeGreaterThanOrEqual(2);
    expect(res.typography!.meta.pages).toEqual(['https://example.com/pricing', 'https://example.com/blog']);

    // Color merged
    expect(res.color).not.toBeNull();
    expect(res.color!.meta.pages).toEqual(['https://example.com/pricing', 'https://example.com/blog']);

    // Spacing merged
    expect(res.spacing).not.toBeNull();
    expect(res.spacing!.baseUnit?.px).toBe(4);

    // Conflicts found across pages
    expect(res.conflicts.length).toBeGreaterThan(0);
    expect(res.conflicts.some(c => c.type === 'typography')).toBe(true);
    expect(res.conflicts.some(c => c.type === 'color')).toBe(true);

    // Google Stitch DESIGN.md generated
    expect(res.stitch).toBeDefined();
    expect(res.stitch).toContain('name: example.com design system');
    expect(res.stitch).toContain('## Typography');
    expect(res.stitch).toContain('## Colors');
    expect(res.stitch).toContain('## Layout');

    // Written files checked on disk
    expect(res.written).toHaveLength(4); // 3 site systems + DESIGN.md
    expect(fs.existsSync(path.join(projectDir, 'DESIGN.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.luci', 'design', 'example-com.system.site-typography.design.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.luci', 'design', 'example-com.system.site-color.design.md'))).toBe(true);
    expect(fs.existsSync(path.join(projectDir, '.luci', 'design', 'example-com.system.site-spacing.design.md'))).toBe(true);
  });

  it('handles dry-run mode without writing files', async () => {
    const projectDir = tempProject();
    await initProject(projectDir);

    const res = await crawlSite({
      urls: ['https://example.com/pricing', 'https://example.com/blog'],
      projectRoot: projectDir,
      dryRun: true,
      stitch: true,
      pageFetcher: async (url: string) => {
        if (url === 'https://example.com/pricing') {
          return { typography: typoPricing, color: colorPricing, spacing: spacingPricing };
        }
        return { typography: typoBlog, color: colorBlog, spacing: spacingBlog };
      }
    });

    expect(res.site).toBe('example.com');
    expect(res.written).toHaveLength(0);
    expect(fs.existsSync(path.join(projectDir, 'DESIGN.md'))).toBe(false);
    expect(fs.existsSync(path.join(projectDir, '.luci', 'design'))).toBe(false);
  });

  it('handles partial failures gracefully when one page fails to load', async () => {
    const res = await crawlSite({
      urls: ['https://example.com/pricing', 'https://example.com/broken-page'],
      stitch: false,
      pageFetcher: async (url: string) => {
        if (url === 'https://example.com/pricing') {
          return { typography: typoPricing, color: colorPricing, spacing: spacingPricing };
        }
        throw new Error('404 Not Found');
      }
    });

    expect(res.crawled).toHaveLength(2);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0]!.url).toBe('https://example.com/broken-page');
    expect(res.errors[0]!.error).toContain('404 Not Found');

    // Still successfully merged the valid page's systems
    expect(res.typography).not.toBeNull();
    expect(res.color).not.toBeNull();
    expect(res.spacing).not.toBeNull();
  });

  it('crawls real pages with headless browser and merges into site DESIGN.md', async () => {
    const server = await serveSites();
    const browser = await launchCrawlerBrowser();
    const projectDir = tempProject();
    await initProject(projectDir);

    try {
      const res = await crawlSite({
        urls: ['/site/', '/site/blog.html'],
        base: server.origin,
        browser,
        stitch: true,
        projectRoot: projectDir
      });

      expect(res.crawled.every(c => !c.error)).toBe(true);
      expect(res.pages).toHaveLength(2);
      expect(res.typography).not.toBeNull();
      expect(res.color).not.toBeNull();
      expect(res.spacing).not.toBeNull();
      expect(res.stitch).toBeDefined();
      expect(fs.existsSync(path.join(projectDir, 'DESIGN.md'))).toBe(true);
      expect(fs.existsSync(path.join(projectDir, '.luci', 'design', '127-0-0-1.system.site-typography.design.md'))).toBe(true);
    } finally {
      await browser.close();
      await server.close();
    }
  }, 60_000);
});
