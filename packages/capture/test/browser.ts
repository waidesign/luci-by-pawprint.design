/**
 * Real-browser test harness: serves the fixture sites from 127.0.0.1 (nothing leaves the machine),
 * bundles the capture code with esbuild, and opens each site in headless Chromium with it loaded.
 */
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { chromium, type Browser, type Page } from 'playwright';

export const SITES_DIR = fileURLToPath(new URL('../fixtures/sites/', import.meta.url));
export const SITES = ['utility', 'css-in-js', 'css-modules', 'web-components', 'css-variables'] as const;
export type SiteName = (typeof SITES)[number];

const TYPES: Readonly<Record<string, string>> = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };

/** Serve the fixture sites. A second server on "localhost" gives a second site (another origin). */
export function serveSites(host = '127.0.0.1'): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent((req.url ?? '/').split('?')[0]!).replace(/\/$/, '/index.html');
    const file = path.join(SITES_DIR, path.normalize(rel));
    if (!file.startsWith(SITES_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  return new Promise(resolve => server.listen(0, host, () => resolve({
    origin: `http://${host}:${(server.address() as AddressInfo).port}`,
    close: () => new Promise<void>(done => server.close(() => done()))
  })));
}

/** The capture code as one script that defines `window.LuciCapture`. */
export async function captureBundle(): Promise<string> {
  const entry = fileURLToPath(new URL('../src/browser.ts', import.meta.url));
  const result = await build({ entryPoints: [entry], bundle: true, format: 'iife', globalName: 'LuciCapture', platform: 'browser', target: 'chrome120', write: false, logLevel: 'silent' });
  return result.outputFiles[0]!.text;
}

export async function launch(): Promise<Browser> {
  try {
    return await chromium.launch();
  } catch (err) {
    throw new Error(`Chromium for Playwright is not installed. Run: pnpm exec playwright install chromium\n${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Open one fixture site with the capture code loaded. */
export async function openSite(browser: Browser, origin: string, site: SiteName, bundle: string): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${origin}/${site}/`);
  await page.waitForLoadState('networkidle');
  await page.addScriptTag({ content: bundle });
  return page;
}
