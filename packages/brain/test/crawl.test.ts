import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
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
import { crawlSite, discoverStorybookUrls, resolveCrawlUrl, launchCrawlerBrowser, initProject } from '../src/index.js';
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

  it('B-72: never resolves to a non-web scheme, with or without a base', () => {
    const base = 'http://localhost:3000';
    for (const raw of ['file:///C:/Windows/win.ini', 'file:///etc/passwd', 'data:text/html,<h1>x</h1>', 'javascript:alert(1)', 'C:/Windows/win.ini', 'ftp://example.com/x']) {
      expect(() => resolveCrawlUrl(raw, base), raw).toThrow(/only http and https|not a valid address/);
      expect(() => resolveCrawlUrl(raw), raw).toThrow();
    }
    // A non-web base is refused too
    expect(() => resolveCrawlUrl('/pricing', 'file:///C:/')).toThrow(/only http and https/);
    // Protocol-relative routes stay on the web
    expect(resolveCrawlUrl('//example.com/a', base)).toBe('http://example.com/a');
  });

  it('discovers Storybook v7/v8 stories from index.json, skips docs, caps maxStories, and falls back to v6 stories.json', async () => {
    // v7/v8 index.json
    const v8Urls = await discoverStorybookUrls('http://localhost:6006/?path=/story/button--primary', {
      maxStories: 2,
      fetcher: async (url) => {
        if (url === 'http://localhost:6006/index.json') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              v: 5,
              entries: {
                'intro--docs': { id: 'intro--docs', type: 'docs' },
                'button--primary': { id: 'button--primary', type: 'story' },
                'button--secondary': { id: 'button--secondary', type: 'story' },
                'card--default': { id: 'card--default', type: 'story' }
              }
            })
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      }
    });
    expect(v8Urls).toEqual([
      'http://localhost:6006/iframe.html?id=button--primary&viewMode=story',
      'http://localhost:6006/iframe.html?id=button--secondary&viewMode=story'
    ]);

    // v6 stories.json fallback + subpath preservation
    const v6Urls = await discoverStorybookUrls('https://ui.example.com/storybook/index.html', {
      fetcher: async (url) => {
        if (url === 'https://ui.example.com/storybook/stories.json') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              v: 3,
              stories: {
                'badge--info': { id: 'badge--info' },
                'input--default': { id: 'input--default' }
              }
            })
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      }
    });
    expect(v6Urls).toEqual([
      'https://ui.example.com/storybook/iframe.html?id=badge--info&viewMode=story',
      'https://ui.example.com/storybook/iframe.html?id=input--default&viewMode=story'
    ]);

    // Refuses non-web scheme and surfaces clean error when unreachable
    await expect(discoverStorybookUrls('file:///tmp/storybook')).rejects.toThrow(/only http and https/);
    await expect(discoverStorybookUrls('http://localhost:6006', {
      fetcher: async () => ({ ok: false, status: 404, json: async () => ({}) })
    })).rejects.toThrow(/Could not read Storybook index/);
  });

  it('crawlSite with storybook: true discovers and crawls every story iframe', async () => {
    const crawledUrls: string[] = [];
    const res = await crawlSite({
      urls: ['http://localhost:6006'],
      storybook: true,
      dryRun: true,
      manifestFetcher: async (url) => {
        if (url === 'http://localhost:6006/index.json') {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              v: 5,
              entries: {
                'docs--page': { id: 'docs--page', type: 'docs' },
                'button--primary': { id: 'button--primary', type: 'story' },
                'card--default': { id: 'card--default', type: 'story' }
              }
            })
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      },
      pageFetcher: async (url) => {
        crawledUrls.push(url);
        return url.includes('button--primary')
          ? { typography: typoPricing, color: colorPricing, spacing: spacingPricing }
          : { typography: typoBlog, color: colorBlog, spacing: spacingBlog };
      }
    });
    expect(crawledUrls).toEqual([
      'http://localhost:6006/iframe.html?id=button--primary&viewMode=story',
      'http://localhost:6006/iframe.html?id=card--default&viewMode=story'
    ]);
    expect(res.crawled).toHaveLength(2);
    expect(res.typography).not.toBeNull();
  });

  it('B-72: crawlSite refuses a file: URL before fetching anything', async () => {
    const fetched: string[] = [];
    const pageFetcher = async (url: string) => { fetched.push(url); return { typography: null, color: null, spacing: null }; };
    await expect(crawlSite({ urls: ['file:///C:/Windows/win.ini'], base: 'http://localhost:3000', dryRun: true, pageFetcher })).rejects.toThrow(/only http and https/);
    expect(fetched).toEqual([]);
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
    // B-78: dryRun populates planned written paths without writing to disk
    expect(res.written.length).toBeGreaterThan(0);
    for (const w of res.written) {
      expect(fs.existsSync(w)).toBe(false);
    }
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

  it('B-71: @luci-dev/brain ships luci-capture.js in dist/ and getCaptureScript() works outside the monorepo without esbuild', () => {
    const brainDir = fileURLToPath(new URL('..', import.meta.url));
    const pkg = JSON.parse(fs.readFileSync(path.join(brainDir, 'package.json'), 'utf8')) as { files?: string[] };
    expect(pkg.files).toContain('dist');
    const distBundle = path.join(brainDir, 'dist', 'luci-capture.js');
    expect(fs.existsSync(distBundle)).toBe(true);

    // Isolate compiled @luci-dev/brain + runtime deps (NO @luci-dev/capture, NO esbuild) outside the monorepo
    const isolated = fs.mkdtempSync(path.join(os.tmpdir(), 'luci-b71-isolated-'));
    try {
      const nm = path.join(isolated, 'node_modules');
      fs.mkdirSync(path.join(nm, '@luci-dev'), { recursive: true });
      const packagesRoot = path.dirname(brainDir);
      for (const name of ['brain', 'format', 'skills']) {
        const srcPkg = path.join(packagesRoot, name);
        const dstPkg = path.join(nm, '@luci-dev', name);
        fs.mkdirSync(dstPkg, { recursive: true });
        fs.copyFileSync(path.join(srcPkg, 'package.json'), path.join(dstPkg, 'package.json'));
        fs.cpSync(path.join(srcPkg, 'dist'), path.join(dstPkg, 'dist'), { recursive: true });
      }
      const formatReq = createRequire(path.join(packagesRoot, 'format', 'package.json'));
      // Linked, not copied: copying them took over a minute on Windows under a full test run. Only these two
      // are reachable; @luci-dev/capture and esbuild still are not (checked below)
      for (const dep of ['zod', 'culori']) {
        const depDir = path.dirname(formatReq.resolve(`${dep}/package.json`));
        fs.symlinkSync(depDir, path.join(nm, dep), 'junction');
      }

      expect(fs.existsSync(path.join(nm, 'esbuild'))).toBe(false);
      expect(fs.existsSync(path.join(nm, '@luci-dev', 'capture'))).toBe(false);

      const probe = path.join(isolated, 'probe.mjs');
      fs.writeFileSync(
        probe,
        `import { getCaptureScript } from '@luci-dev/brain';\n` +
        `const script = await getCaptureScript();\n` +
        `if (!script.includes('LuciCapture') || script.length < 1000) throw new Error('Invalid capture bundle');\n` +
        `console.log('OK:' + script.length);\n`,
        'utf8'
      );
      const res = spawnSync(process.execPath, [probe], { cwd: isolated, encoding: 'utf8' });
      expect(res.status, res.stderr || res.stdout).toBe(0);
      expect(res.stdout.trim()).toMatch(/^OK:\d+$/);
    } finally {
      fs.rmSync(isolated, { recursive: true, force: true });
    }
  }, 120_000);
});
