/**
 * Serves the fixture React app (fixtures/app) the way Vite's dev server does: each source file is
 * transformed on request (JSX in development mode, with an inline source map) and served at its own
 * path (/src/pages/Pricing.jsx), and React is one pre-bundled copy under /node_modules/.vite/deps/.
 * So the React adapter sees the same fibers, stacks and URLs it meets in a real project. Local only.
 */
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileScript, compileTemplate, parse } from '@vue/compiler-sfc';
import { build, transform } from 'esbuild';
import { compile as compileSvelte } from 'svelte/compiler';

export const APP_DIR = fileURLToPath(new URL('../fixtures/app/', import.meta.url));
export const VUE_APP_DIR = fileURLToPath(new URL('../fixtures/vue-app/', import.meta.url));
export const SVELTE_APP_DIR = fileURLToPath(new URL('../fixtures/svelte-app/', import.meta.url));
const REPO = fileURLToPath(new URL('../../../', import.meta.url));

/** React and React DOM, development builds, as one module (one React instance), plus the per-entry modules the import map names. */
async function vendor(): Promise<Record<string, string>> {
  const result = await build({
    stdin: {
      contents: "import * as React from 'react'; import * as ReactDOMClient from 'react-dom/client'; import * as JsxDev from 'react/jsx-dev-runtime'; export { React, ReactDOMClient, JsxDev };",
      resolveDir: REPO,
      loader: 'js'
    },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"development"' },
    write: false,
    logLevel: 'silent'
  });
  return {
    'chunk-react.js': result.outputFiles[0]!.text,
    'react.js': "import { React } from './chunk-react.js'; export default React; export const { useState, useEffect, useRef, Fragment } = React;",
    'react_jsx-dev-runtime.js': "import { JsxDev } from './chunk-react.js'; export const { jsxDEV, Fragment } = JsxDev;",
    'react-dom_client.js': "import { ReactDOMClient } from './chunk-react.js'; export const { createRoot } = ReactDOMClient;"
  };
}

export interface AppServer {
  origin: string;
  /** Extra files served as-is (a test adds the toolbar bundle). */
  files: Map<string, { type: string; body: string }>;
  close(): Promise<void>;
}

export async function serveApp(): Promise<AppServer> {
  const deps = await vendor();
  const files = new Map<string, { type: string; body: string }>();
  const server = http.createServer((req, res) => {
    void (async () => {
      const route = decodeURIComponent((req.url ?? '/').split('?')[0]!);
      const extra = files.get(route);
      if (extra) { res.writeHead(200, { 'content-type': extra.type }).end(extra.body); return; }
      const dep = /^\/node_modules\/\.vite\/deps\/([\w.-]+)$/.exec(route)?.[1];
      if (dep && deps[dep]) { res.writeHead(200, { 'content-type': 'text/javascript' }).end(deps[dep]); return; }
      if (route.startsWith('/src/') && route.endsWith('.jsx')) {
        const file = path.join(APP_DIR, path.normalize(route));
        if (!file.startsWith(APP_DIR) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
        const out = await transform(fs.readFileSync(file, 'utf8'), {
          loader: 'jsx', jsx: 'automatic', jsxDev: true, sourcemap: 'inline', sourcefile: route, format: 'esm'
        });
        res.writeHead(200, { 'content-type': 'text/javascript' }).end(out.code);
        return;
      }
      // Every other path is a page of the app
      res.writeHead(200, { 'content-type': 'text/html' }).end(fs.readFileSync(path.join(APP_DIR, 'index.html')));
    })().catch(err => { res.writeHead(500).end(String(err)); });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    files,
    close: () => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); })
  })));
}

async function vendorVue(): Promise<Record<string, string>> {
  const result = await build({
    stdin: { contents: "export * from 'vue';", resolveDir: REPO, loader: 'js' },
    bundle: true,
    format: 'esm',
    platform: 'browser',
    define: {
      'process.env.NODE_ENV': '"development"',
      __VUE_OPTIONS_API__: 'true',
      __VUE_PROD_DEVTOOLS__: 'false',
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false'
    },
    write: false,
    logLevel: 'silent'
  });
  return { 'vue.js': result.outputFiles[0]!.text };
}

function compileVueSfc(source: string, route: string): string {
  const relFile = route.slice(1);
  const baseName = path.basename(relFile, '.vue');
  const { descriptor } = parse(source, { filename: relFile });
  if (descriptor.script || descriptor.scriptSetup) {
    const script = compileScript(descriptor, { id: relFile, isProd: false, inlineTemplate: true });
    const code = script.content.replace(/export\s+default\s+/, 'const _sfc_main = ');
    return `${code}\n_sfc_main.__file = ${JSON.stringify(relFile)};\n_sfc_main.__name = _sfc_main.__name || ${JSON.stringify(baseName)};\nexport default _sfc_main;\n`;
  }
  const tpl = compileTemplate({ source: descriptor.template?.content ?? '', filename: relFile, id: relFile, isProd: false });
  return `${tpl.code}\nconst _sfc_main = { render, __name: ${JSON.stringify(baseName)}, __file: ${JSON.stringify(relFile)} };\nexport default _sfc_main;\n`;
}

/** Serves the fixture Vue 3 app (fixtures/vue-app) in development mode with SFCs compiled on request. */
export async function serveVueApp(): Promise<AppServer> {
  const deps = await vendorVue();
  const files = new Map<string, { type: string; body: string }>();
  const server = http.createServer((req, res) => {
    void (async () => {
      const route = decodeURIComponent((req.url ?? '/').split('?')[0]!);
      const extra = files.get(route);
      if (extra) { res.writeHead(200, { 'content-type': extra.type }).end(extra.body); return; }
      const dep = /^\/node_modules\/\.vite\/deps\/([\w.-]+)$/.exec(route)?.[1];
      if (dep && deps[dep]) { res.writeHead(200, { 'content-type': 'text/javascript' }).end(deps[dep]); return; }
      if (route.startsWith('/src/') && (route.endsWith('.js') || route.endsWith('.vue'))) {
        const file = path.join(VUE_APP_DIR, path.normalize(route));
        if (!file.startsWith(VUE_APP_DIR) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
        const raw = fs.readFileSync(file, 'utf8');
        const body = route.endsWith('.vue') ? compileVueSfc(raw, route) : raw;
        res.writeHead(200, { 'content-type': 'text/javascript' }).end(body);
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' }).end(fs.readFileSync(path.join(VUE_APP_DIR, 'index.html')));
    })().catch(err => { res.writeHead(500).end(String(err)); });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    files,
    close: () => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); })
  })));
}

async function vendorSvelte(): Promise<Record<string, string>> {
  const result = await build({
    entryPoints: {
      svelte: 'svelte',
      svelte_internal_client: 'svelte/internal/client',
      'svelte_internal_disclose-version': 'svelte/internal/disclose-version',
      svelte_internal_flags_legacy: 'svelte/internal/flags/legacy'
    },
    absWorkingDir: REPO,
    bundle: true,
    splitting: true,
    format: 'esm',
    platform: 'browser',
    conditions: ['development', 'browser'],
    define: { 'process.env.NODE_ENV': '"development"' },
    outdir: '/out',
    write: false,
    logLevel: 'silent'
  });
  const deps: Record<string, string> = {};
  for (const f of result.outputFiles) deps[path.basename(f.path)] = f.text;
  return deps;
}

/** Serves the fixture Svelte 5 app (fixtures/svelte-app) in development mode with `.svelte` files compiled on request. */
export async function serveSvelteApp(): Promise<AppServer> {
  const deps = await vendorSvelte();
  const files = new Map<string, { type: string; body: string }>();
  const server = http.createServer((req, res) => {
    void (async () => {
      const route = decodeURIComponent((req.url ?? '/').split('?')[0]!);
      const extra = files.get(route);
      if (extra) { res.writeHead(200, { 'content-type': extra.type }).end(extra.body); return; }
      const dep = /^\/node_modules\/\.vite\/deps\/([\w.-]+)$/.exec(route)?.[1];
      if (dep && deps[dep]) { res.writeHead(200, { 'content-type': 'text/javascript' }).end(deps[dep]); return; }
      if (route.startsWith('/src/') && (route.endsWith('.js') || route.endsWith('.svelte'))) {
        const file = path.join(SVELTE_APP_DIR, path.normalize(route));
        if (!file.startsWith(SVELTE_APP_DIR) || !fs.existsSync(file)) { res.writeHead(404).end(); return; }
        const raw = fs.readFileSync(file, 'utf8');
        const body = route.endsWith('.svelte') ? compileSvelte(raw, { filename: route.slice(1), dev: true }).js.code : raw;
        res.writeHead(200, { 'content-type': 'text/javascript' }).end(body);
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html' }).end(fs.readFileSync(path.join(SVELTE_APP_DIR, 'index.html')));
    })().catch(err => { res.writeHead(500).end(String(err)); });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({
    origin: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    files,
    close: () => new Promise<void>(done => { server.closeAllConnections(); server.close(() => done()); })
  })));
}
