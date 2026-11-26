/**
 * Multi-page design crawl (v0.4.2): crawl a list of routes or URLs of a site in one pass,
 * extract typography, color and spacing systems from each page, and merge them into a unified
 * site-level DESIGN.md system (and individual .design.md system files).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
  // Shipped inside @luci-dev/brain/dist/luci-capture.js for npm installs (B-71); when running
  // directly from TypeScript source in the monorepo, check packages/brain/dist/ as well.
  const candidates = [
    fileURLToPath(new URL('../luci-capture.js', import.meta.url)),
    fileURLToPath(new URL('../../dist/luci-capture.js', import.meta.url))
  ];
  for (const prebuilt of candidates) {
    if (fs.existsSync(prebuilt)) {
      cachedBundle = fs.readFileSync(prebuilt, 'utf8');
      return cachedBundle;
    }
  }
  throw new Error('Luci capture bundle (luci-capture.js) was not found in @luci-dev/brain/dist. Run `pnpm build` in a source checkout or reinstall @luci-dev/cli.');
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
    throw new Error('Chromium for Playwright is not installed. Run: npx playwright install chromium');
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

export const DEFAULT_MAX_STORYBOOK_STORIES = 50;

export interface StorybookManifestResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

export type StorybookManifestFetcher = (url: string) => Promise<StorybookManifestResponse>;

export interface DiscoverStorybookOptions {
  /** Maximum number of stories to return (default: 50) */
  maxStories?: number;
  /** Custom HTTP fetcher for tests without a live Storybook server */
  fetcher?: StorybookManifestFetcher;
}

export interface CrawlOptions {
  urls: readonly string[];
  /** Base URL to resolve relative routes against (e.g. "http://localhost:3000") */
  base?: string;
  /** Discover stories from a Storybook server (/index.json or /stories.json) instead of crawling the root page */
  storybook?: boolean;
  /** Maximum number of Storybook stories to crawl when storybook is true (default: 50) */
  maxStories?: number;
  /** Custom manifest fetcher for Storybook discovery in tests */
  manifestFetcher?: StorybookManifestFetcher;
  /** An existing Playwright browser instance */
  browser?: any;
  /** Timeout per page in milliseconds (default: 30000) */
  timeout?: number;
  /** Generate Google Stitch DESIGN.md file at the project root (default: false) */
  stitch?: boolean;
  /** Overwrite an existing root DESIGN.md when stitch is true (default: false) */
  force?: boolean;
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
  // Only web pages: a file:, data: or javascript: address must never reach the browser, with or
  // without a base (new URL keeps an absolute address's own scheme and ignores the base) (B-72)
  const webOnly = (href: string): string => {
    let url: URL;
    try { url = new URL(href); } catch { throw new Error(`"${trimmed}" is not a valid address.`); }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error(`Luci crawls only http and https pages; "${trimmed}" uses ${url.protocol.replace(/:$/, '')}.`);
    }
    return url.href;
  };
  if (/^https?:\/\//i.test(trimmed)) { webOnly(trimmed); return trimmed; }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed) && !/^[a-z]:[\\/]/i.test(trimmed)) return webOnly(trimmed);
  if (!base) throw new Error(`Relative route "${trimmed}" requires a base URL (e.g. --base http://localhost:3000).`);
  const baseUrl = webOnly(base.endsWith('/') ? base : `${base}/`);
  return webOnly(new URL(trimmed, baseUrl).href);
}

/**
 * Discover story preview URLs from a running Storybook server.
 * Reads `/index.json` (Storybook v7/v8) with automatic fallback to `/stories.json` (Storybook v6),
 * skips docs pages, and returns `/iframe.html?id=<id>&viewMode=story` URLs capped at `maxStories`.
 */
export async function discoverStorybookUrls(
  storybookUrl: string,
  options: DiscoverStorybookOptions = {}
): Promise<string[]> {
  const maxStories = Math.max(1, options.maxStories ?? DEFAULT_MAX_STORYBOOK_STORIES);
  const resolved = resolveCrawlUrl(storybookUrl);
  const parsed = new URL(resolved);
  parsed.search = '';
  parsed.hash = '';
  parsed.pathname = parsed.pathname.replace(/\/(?:index|iframe)\.html$/i, '/');
  if (!parsed.pathname.endsWith('/')) parsed.pathname += '/';
  const rootHref = parsed.href;

  const doFetch: StorybookManifestFetcher = options.fetcher ?? ((url) => fetch(url));

  const readManifest = async (file: 'index.json' | 'stories.json'): Promise<unknown | null> => {
    try {
      const res = await doFetch(`${rootHref}${file}`);
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  };

  const payload = (await readManifest('index.json')) ?? (await readManifest('stories.json'));
  if (!payload || typeof payload !== 'object') {
    throw new Error(
      `Could not read Storybook index at ${rootHref}index.json (or stories.json). Make sure Storybook is running at ${storybookUrl}.`
    );
  }

  const record = payload as { entries?: unknown; stories?: unknown };
  const rawEntries = (record.entries && typeof record.entries === 'object')
    ? record.entries as Record<string, unknown>
    : (record.stories && typeof record.stories === 'object')
      ? record.stories as Record<string, unknown>
      : null;

  if (!rawEntries) {
    throw new Error(`Storybook index at ${rootHref} did not contain an entries or stories map.`);
  }

  const seen = new Set<string>();
  const storyUrls: string[] = [];
  for (const [key, value] of Object.entries(rawEntries)) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as { id?: unknown; type?: unknown };
    if (entry.type === 'docs') continue;
    const id = (typeof entry.id === 'string' && entry.id.trim()) ? entry.id.trim() : key.trim();
    if (!id || !/^[a-z0-9_-]+$/i.test(id) || seen.has(id)) continue;
    seen.add(id);
    storyUrls.push(`${rootHref}iframe.html?id=${encodeURIComponent(id)}&viewMode=story`);
    if (storyUrls.length >= maxStories) break;
  }

  if (!storyUrls.length) {
    throw new Error(`No stories found in Storybook at ${storybookUrl}.`);
  }
  return storyUrls;
}

/**
 * Crawl a list of routes or URLs of a site, extract typography, color and spacing systems,
 * and merge them into unified site-level design systems.
 */
export async function crawlSite(options: CrawlOptions): Promise<CrawlSiteResult> {
  const {
    urls,
    base,
    storybook = false,
    maxStories,
    manifestFetcher,
    timeout = 30_000,
    stitch = false,
    force = false,
    dryRun = false,
    projectRoot,
    onProgress,
    pageFetcher
  } = options;
  if (!urls.length) throw new Error('Provide at least one URL or route to crawl.');

  let resolvedUrls: { raw: string; resolved: string }[];
  if (storybook) {
    const discovered: { raw: string; resolved: string }[] = [];
    const seen = new Set<string>();
    for (const u of urls) {
      const target = resolveCrawlUrl(u, base);
      const storyUrls = await discoverStorybookUrls(target, { maxStories, fetcher: manifestFetcher });
      for (const storyUrl of storyUrls) {
        if (seen.has(storyUrl)) continue;
        seen.add(storyUrl);
        const parsed = new URL(storyUrl);
        const id = parsed.searchParams.get('id');
        discovered.push({ raw: id ? `/iframe.html?id=${id}` : storyUrl, resolved: storyUrl });
      }
    }
    resolvedUrls = discovered;
  } else {
    resolvedUrls = urls.map(u => ({ raw: u, resolved: resolveCrawlUrl(u, base) }));
  }
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

  if (projectRoot) {
    const store = new DesignStore(projectRoot);
    const save = (c: SystemCapture | null) => {
      if (!c) return;
      const fileName = captureFileName(c.meta);
      const targetPath = path.join(projectRoot, '.luci', 'design', fileName);
      if (!dryRun) {
        const content = formatCapture(c);
        store.save(fileName, content);
      }
      written.push(targetPath);
    };
    save(merged.typography);
    save(merged.color);
    save(merged.spacing);

    if (stitch && stitchContent) {
      const stitchPath = path.join(projectRoot, STITCH_FILE_NAME);
      if (fs.existsSync(stitchPath) && !force && !dryRun) {
        throw new Error(`${STITCH_FILE_NAME} is already in this project. Run again with --force to replace it.`);
      }
      if (!dryRun) {
        fs.writeFileSync(stitchPath, stitchContent, 'utf8');
      }
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
