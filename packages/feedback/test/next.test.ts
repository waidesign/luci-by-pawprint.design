/**
 * Next.js App Router with Turbopack (found on the user's app, 2026-11-13): server components exist in
 * the browser only as records, their stacks point into the server bundle on disk (addresses nested and
 * encoded twice, holding parentheses), and Turbopack writes sectioned source maps. These replay the
 * shapes React 19.3 and Next 16 produced there.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { firstUserLocation, frameResolver, isLibraryFrame, mapLookup, moduleIdPath, pageFile, projectPath, reactInfo, stackFrames } from '../src/index.js';
import { serverFile, serverResolver } from '../../cli/src/serve/resolve.js';

const made: string[] = [];
afterEach(() => { for (const d of made.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

const ROOT = 'E:/vht - Copy';
/**
 * The server chunk address as Next writes it inside a browser stack: the chunk's file: URL with the
 * module id ("?id=%5Bproject%5D/...+%5Bapp-rsc%5D+(ecmascript)"), all passed through encodeURI once more.
 */
const nested = (root: string) =>
  `about://React/Server/${encodeURI(`${pathToFileURL(path.join(root, 'apps/web/.next/dev/server/chunks/ssr/[root-of-the-server]__030._.js')).href}?id=%5Bproject%5D/apps/web/src/app/page.tsx+%5Bapp-rsc%5D+(ecmascript)`)}`;

describe('Next.js App Router addresses (pure)', () => {
  it('reads stack lines whose address holds parentheses and nested, twice-encoded URLs', () => {
    const url = nested(ROOT);
    const frames = stackFrames(`Error: react-stack-top-frame\n    at fakeJSXCallSite (http://localhost:3001/_next/static/chunks/09m2_next_dist_compiled_react-server-dom-turbopack_1j._.js:2093:21)\n    at HomePage (${url}+(ecmascript):128:403)\n    at Object.react_stack_bottom_frame (http://localhost:3001/_next/static/chunks/09m2_next_dist_compiled_react-dom_0x.js:15013:24)`);
    expect(frames.map(f => f.fn)).toEqual(['fakeJSXCallSite', 'HomePage', 'Object.react_stack_bottom_frame']);
    expect(frames[1]).toMatchObject({ line: 128, column: 403 });
    expect(frames.map(isLibraryFrame)).toEqual([true, false, true]);
    expect(moduleIdPath(frames[1]!.url)).toBe('apps/web/src/app/page.tsx');
    expect(projectPath(frames[1]!.url)).toBe('apps/web/src/app/page.tsx');
    // The exact address seen on the user's app, and the same one encoded whole
    const seen = 'about://React/Server/file:///E:/vht%2520-%2520Copy/apps/web/.next/dev/server/chunks/ssr/%255Broot-of-the-server%255D__030zkooddeva2._.js?id=%255Bproject%255D/apps/web/src/app/page.tsx+%255Bapp-rsc%255D+(ecmascript)';
    expect(moduleIdPath(seen)).toBe('apps/web/src/app/page.tsx');
    expect(moduleIdPath(`about://React/Server/${encodeURIComponent('file:///E:/app/x.js?id=[project]/src/app/page.tsx [app-rsc] (ecmascript)')}`)).toBe('src/app/page.tsx');
  });

  it("treats Turbopack's library chunks and React's own functions as library code", () => {
    expect(isLibraryFrame({ fn: 'exports.jsxDEV', url: 'http://localhost:3001/_next/static/chunks/node_modules__pnpm_1pv4._.js', line: 1 })).toBe(true);
    expect(isLibraryFrame({ fn: 'LinkComponent', url: 'http://localhost:3001/_next/static/chunks/node_modules__pnpm_1pv4._.js', line: 1 })).toBe(true);
    expect(isLibraryFrame({ fn: 'ReportIngestionCard', url: 'http://localhost:3001/_next/static/chunks/_18aeywddyxrk_._.js', line: 407 })).toBe(false);
  });

  it("picks the page's own file: a route file first, then pages/ and the like, then app/", () => {
    expect(pageFile(['apps/web/src/app/layout.tsx', 'apps/web/src/app/page.tsx', 'apps/web/src/app/_components/home-hero.tsx'])).toBe('apps/web/src/app/page.tsx');
    expect(pageFile(['src/App.jsx', 'src/pages/Pricing.jsx'])).toBe('src/pages/Pricing.jsx');
    expect(pageFile(['apps/web/src/app/_components/app-header.tsx'])).toBe('apps/web/src/app/_components/app-header.tsx');
    expect(pageFile(['src/components/Nav.jsx'])).toBeUndefined();
  });
});

describe('the creator chain through server components', () => {
  // Shapes from the user's home page: button <- ReportIngestionCard <- HomeHero (client) <- HomePage (server record)
  function HomeHero() { return null; }
  function ReportIngestionCard() { return null; }
  const chunk = 'http://localhost:3001/_next/static/chunks/_18aeywddyxrk_._.js';
  const lib = 'http://localhost:3001/_next/static/chunks/node_modules__pnpm_1pv4._.js';
  const homePage = { name: 'HomePage', env: 'Server', key: null, owner: null, stack: [['Promise.all', '', 0, 0, 0, 0, true]] };
  const homeHero = { tag: 0, type: HomeHero, _debugOwner: homePage, _debugStack: { stack: `Error: react-stack-top-frame\n    at fakeJSXCallSite (http://localhost:3001/_next/static/chunks/09m2_next_dist_compiled_react-server-dom-turbopack_1j._.js:2093:21)\n    at HomePage (${nested(ROOT)}+(ecmascript):120:387)` } };
  const card = { tag: 0, type: ReportIngestionCard, _debugOwner: homeHero, _debugStack: { stack: `Error\n    at exports.jsxDEV (${lib}:5995:33)\n    at HomeHero (${chunk}:41:326)` } };
  const button = { tag: 5, type: 'button', _debugOwner: card, _debugStack: { stack: `Error\n    at exports.jsxDEV (${lib}:5995:33)\n    at ReportIngestionCard (${chunk}:407:334)` } };
  const el = { __reactFiber$abc: button, parentElement: null } as unknown as Element;

  it('names every component, server ones included, with where each one is written', async () => {
    const info = reactInfo(el)!;
    expect(info.components).toEqual(['HomePage', 'HomeHero', 'ReportIngestionCard']);
    expect(info.frames[0]).toMatchObject({ fn: 'ReportIngestionCard', line: 407 });
    // Without luci serve: a server position is named by its module, without a line
    const resolve = frameResolver(async () => null);
    expect(await firstUserLocation(info.componentFrames[0]!, resolve)).toEqual({ file: 'apps/web/src/app/page.tsx' });
    // With luci serve, it asks the bridge for server positions
    const asked: string[] = [];
    const withBridge = frameResolver(async () => null, async frames => { asked.push(...frames.map(f => f.url)); return [{ file: 'apps/web/src/app/page.tsx', line: 31, column: 9 }]; });
    expect(await firstUserLocation(info.componentFrames[0]!, withBridge)).toEqual({ file: 'apps/web/src/app/page.tsx', line: 31, column: 9 });
    expect(asked).toHaveLength(1);
  });

  it('leaves out library components whose JSX is all library code (Next\'s Link)', () => {
    function LinkComponent() { return null; }
    function AppHeader() { return null; }
    const header = { tag: 0, type: AppHeader, _debugOwner: null, _debugStack: { stack: '' } };
    const link = { tag: 0, type: LinkComponent, _debugOwner: header, _debugStack: { stack: `Error\n    at exports.jsx (${lib}:1150:33)\n    at AppHeader (${chunk}:30:13)` } };
    const a = { tag: 5, type: 'a', _debugOwner: link, _debugStack: { stack: `Error\n    at exports.jsx (${lib}:1150:33)\n    at LinkComponent (${lib}:4198:50)` } };
    const info = reactInfo({ __reactFiber$x: a, parentElement: null } as unknown as Element)!;
    expect(info.components).toEqual(['AppHeader']);
    // The <a> was made inside Link: its place in the project is where <Link> is used
    expect(info.frames[0]).toMatchObject({ fn: 'AppHeader', line: 30 });
  });
});

describe('sectioned source maps and the server resolver (luci serve)', () => {
  it('maps a position in a Turbopack server chunk to the project file and line', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'luci-next-'));
    made.push(root);
    // A real bundle: two modules in one chunk, with a map; then wrapped as a sectioned map like Turbopack's
    const src = path.join(root, 'apps/web/src/app');
    fs.mkdirSync(src, { recursive: true });
    fs.writeFileSync(path.join(src, 'page.tsx'), 'export function HomePage() {\n  const a = 1;\n  return a + helper();\n}\nfunction helper() {\n  return 2;\n}\n');
    const out = await build({ entryPoints: [path.join(src, 'page.tsx')], bundle: true, write: false, sourcemap: 'external', outfile: 'chunk.js', format: 'esm', absWorkingDir: root });
    const js = out.outputFiles.find(f => f.path.endsWith('.js'))!.text;
    const plain = JSON.parse(out.outputFiles.find(f => f.path.endsWith('.map'))!.text);
    plain.sources = plain.sources.map(() => 'turbopack:///[project]/apps/web/src/app/page.tsx');
    const chunkDir = path.join(root, 'apps/web/.next/dev/server/chunks/ssr');
    fs.mkdirSync(chunkDir, { recursive: true });
    const chunkFile = path.join(chunkDir, '[root-of-the-server]__030._.js');
    const prefix = '// turbopack runtime\n';
    fs.writeFileSync(chunkFile, `${prefix}${js}\n//# sourceMappingURL=${encodeURIComponent(path.basename(chunkFile))}.map\n`);
    fs.writeFileSync(`${chunkFile}.map`, JSON.stringify({ version: 3, sections: [{ offset: { line: 1, column: 0 }, map: plain }] }));

    const genLine = js.split('\n').findIndex(l => l.includes('return 2')) + 2; // +1 for 1-based, +1 for the prefix line
    const col = js.split('\n')[genLine - 2]!.indexOf('return') + 1;
    expect(mapLookup(JSON.parse(fs.readFileSync(`${chunkFile}.map`, 'utf8')))!(genLine, col)).toMatchObject({ line: 6 });

    const resolve = serverResolver(root);
    expect(resolve({ url: nested(root), line: genLine, column: col })).toEqual({ file: 'apps/web/src/app/page.tsx', line: 6, column: expect.any(Number) });
    expect(serverFile(nested(root))).toBe(chunkFile);
    // A file outside the project is never read: only the module's name comes back
    expect(resolve({ url: nested(path.join(os.tmpdir(), 'elsewhere')), line: 1 })).toEqual({ file: 'apps/web/src/app/page.tsx' });
  });
});
