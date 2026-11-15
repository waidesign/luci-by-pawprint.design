/**
 * Multi-page design crawl (v0.4.2): crawl a list of routes or URLs of a site in one pass,
 * extract typography, color and spacing systems from each page, and merge them into a unified
 * site-level DESIGN.md system (and individual .design.md system files).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import {
  STITCH_FILE_NAME,
  captureFileName,
  formatCapture,
  formatStitch,
  mergeSiteSystems,
  siteName,
  type ColorSystem,
  type SpacingSystem,
  type SystemCapture,
  type SystemConflict,
  type TypographySystem
} from '@luci-dev/format/capture';
import { DesignStore } from './designStore.js';

let cachedBundle: string | null = null;

/** The Luci capture browser bundle (IIFE defining window.LuciCapture). */
export async function getCaptureScript(): Promise<string> {
  if (cachedBundle) return cachedBundle;
  const prebuilt = fileURLToPath(new URL('../../../capture/dist/luci-capture.js', import.meta.url));
  if (fs.existsSync(prebuilt)) {
    cachedBundle = fs.readFileSync(prebuilt, 'utf8');
    return cachedBundle;
  }
  const entry = fileURLToPath(new URL('../../../capture/src/browser.ts', import.meta.url));
  const res = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    globalName: 'LuciCapture',
    platform: 'browser',
    target: 'chrome110',
    write: false,
    logLevel: 'silent'
  });
  cachedBundle = res.outputFiles[0]!.text;
  return cachedBundle;
}

/** Dynamically launch Playwright Chromium (returns a Browser). */
export async function launchCrawlerBrowser(): Promise<any> {
  const tryImport = async (name: string) => {
    try {
      // Dynamic import with variable prevents TypeScript from failing if optional peer is missing
      const mod = await import(name);
      return mod.chromium ?? mod.default?.chromium;
    } catch {
      return null;
    }
  };

  const chromium = (await tryImport('playwright')) ?? (await tryImport('playwright-core'));
  if (!chromium) {
    throw new Error('Chromium for Playwright is not installed. Run: pnpm exec playwright install chromium');
  }
  return await chromium.launch();
}

export interface CrawlPageResult {
  url: string;
  route: string;
  typography: TypographySystem | null;
  color: ColorSystem | null;
  spacing: SpacingSystem | null;
  error?: string;
}

export interface CrawlProgress {
  current: number;
  total: number;
  url: string;
  status: 'crawling' | 'done' | 'failed';
  error?: string;
}

export interface CrawlOptions {
  urls: readonly string[];
  /** Base URL to resolve relative routes against (e.g. "http://localhost:3000") */
  base?: string;
  /** An existing Playwright browser instance */
  browser?: any;
  /** Timeout per page in milliseconds (default: 30000) */
  timeout?: number;
  /** Generate Google Stitch DESIGN.md file (default: true) */
  stitch?: boolean;
  /** Only simulate and report what would be written */
  dryRun?: boolean;
  /** Project root to write .luci/design/ and root DESIGN.md */
  projectRoot?: string;
  /** Progress callback */
  onProgress?: (progress: CrawlProgress) => void;
  /** Custom page extractor for mocked testing without browser launching */
  pageFetcher?: (url: string) => Promise<{ typography: TypographySystem | null; color: ColorSystem | null; spacing: SpacingSystem | null }>;
}

export interface CrawlSiteResult {
  site: string;
  origin: string;
  pages: string[];
  crawled: CrawlPageResult[];
  typography: TypographySystem | null;
  color: ColorSystem | null;
  spacing: SpacingSystem | null;
  stitch?: string;
  conflicts: { type: string; conflict: SystemConflict }[];
  written: string[];
  errors: { url: string; error: string }[];
}

/** Resolve a URL or route against the given base URL */
export function resolveCrawlUrl(raw: string, base?: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (!base) throw new Error(`Relative route "${trimmed}" requires a base URL (e.g. --base http://localhost:3000).`);
  return new URL(trimmed, base.endsWith('/') ? base : `${base}/`).href;
}

/**
 * Crawl a list of routes or URLs of a site, extract typography, color and spacing systems,
 * and merge them into unified site-level design systems.
 */
export async function crawlSite(options: CrawlOptions): Promise<CrawlSiteResult> {
  const { urls, base, timeout = 30_000, stitch = true, dryRun = false, projectRoot, onProgress, pageFetcher } = options;
  if (!urls.length) throw new Error('Provide at least one URL or route to crawl.');

  const resolvedUrls = urls.map(u => ({ raw: u, resolved: resolveCrawlUrl(u, base) }));
  const crawled: CrawlPageResult[] = [];
  const errors: { url: string; error: string }[] = [];

  let browser = options.browser;
  let ownBrowser = false;
  let script: string | null = null;

  try {
    if (!pageFetcher && !browser) {
      browser = await launchCrawlerBrowser();
      ownBrowser = true;
    }
    if (!pageFetcher) {
      script = await getCaptureScript();
    }

    for (let i = 0; i < resolvedUrls.length; i++) {
      const { raw, resolved } = resolvedUrls[i]!;
      onProgress?.({ current: i + 1, total: resolvedUrls.length, url: resolved, status: 'crawling' });
      try {
        if (pageFetcher) {
          const res = await pageFetcher(resolved);
          crawled.push({ url: resolved, route: raw, ...res });
          onProgress?.({ current: i + 1, total: resolvedUrls.length, url: resolved, status: 'done' });
        } else {
          const page = await browser.newPage();
          try {
            page.setDefaultTimeout(timeout);
            await page.goto(resolved, { waitUntil: 'domcontentloaded' });
            await page.addScriptTag({ content: script! });
            const systems = await page.evaluate(() => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const g = globalThis as any;
              const lc = g.LuciCapture;
              if (!lc) throw new Error('LuciCapture could not be initialized on the page.');
              const snap = lc.snapshotPage(g.document);
              return {
                typography: lc.typographySystem(snap),
                color: lc.colorSystem(snap),
                spacing: lc.spacingSystem(snap)
              };
            });
            crawled.push({ url: resolved, route: raw, ...systems });
            onProgress?.({ current: i + 1, total: resolvedUrls.length, url: resolved, status: 'done' });
          } finally {
            await page.close().catch(() => {});
          }
        }
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err);
        crawled.push({ url: resolved, route: raw, typography: null, color: null, spacing: null, error });
        errors.push({ url: resolved, error });
        onProgress?.({ current: i + 1, total: resolvedUrls.length, url: resolved, status: 'failed', error });
      }
    }
  } finally {
    if (ownBrowser && browser) {
      await browser.close().catch(() => {});
    }
  }

  // Collect systems to merge
  const systems: SystemCapture[] = [];
  for (const c of crawled) {
    if (c.typography) systems.push(c.typography);
    if (c.color) systems.push(c.color);
    if (c.spacing) systems.push(c.spacing);
  }

  const merged = mergeSiteSystems(systems);
  const firstUrl = resolvedUrls[0]!.resolved;
  const origin = new URL(firstUrl).origin;
  const site = merged.site || siteName(firstUrl) || 'site';

  let stitchContent: string | undefined;
  if (stitch) {
    const systemsForStitch = [merged.typography, merged.color, merged.spacing].filter((s): s is NonNullable<typeof s> => s !== null);
    if (systemsForStitch.length > 0) {
      stitchContent = formatStitch(systemsForStitch, { name: `${site} design system` });
    }
  }

  const written: string[] = [];

  if (projectRoot && !dryRun) {
    const store = new DesignStore(projectRoot);
    const save = (c: SystemCapture | null) => {
      if (!c) return;
      const fileName = captureFileName(c.meta);
      const content = formatCapture(c);
      store.save(fileName, content);
      written.push(path.join(projectRoot, '.luci', 'design', fileName));
    };
    save(merged.typography);
    save(merged.color);
    save(merged.spacing);

    if (stitch && stitchContent) {
      const stitchPath = path.join(projectRoot, STITCH_FILE_NAME);
      fs.writeFileSync(stitchPath, stitchContent, 'utf8');
      written.push(stitchPath);
    }
  }

  return {
    site,
    origin,
    pages: merged.pages.length ? merged.pages : resolvedUrls.map(u => u.resolved),
    crawled,
    typography: merged.typography,
    color: merged.color,
    spacing: merged.spacing,
    stitch: stitchContent,
    conflicts: merged.conflicts,
    written,
    errors
  };
}
