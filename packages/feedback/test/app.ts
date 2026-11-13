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
import { build, transform } from 'esbuild';

export const APP_DIR = fileURLToPath(new URL('../fixtures/app/', import.meta.url));
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
