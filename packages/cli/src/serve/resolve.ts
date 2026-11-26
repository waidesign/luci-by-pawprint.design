/**
 * Server-side positions for the dev toolbar: a server component's stack points into the server's
 * bundle on disk (Next.js: .next/), which the browser cannot read. `luci serve` can: it reads only
 * source maps (.map) of files inside the project, and answers with the project file and line.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapLookup, moduleIdPath, projectPath, sourceMapRef, type MapLookup } from '@luci-dev/feedback';
import type { SourceLocation } from '@luci-dev/format/feedback';

export interface ServerFrame {
  url: string;
  line: number;
  column?: number;
}

/** The file on disk a server frame names, or null ("about://React/Server/E:%5C...js?5", "file:///E:/app/...js?id=..."). */
export function serverFile(url: string): string | null {
  try {
    if (url.startsWith('about://React/Server/')) {
      // Either a path ("E:%5Capp%5C...js?5") or a whole file: URL, encoded once more
      const inner = decodeURIComponent(url.slice('about://React/Server/'.length).replace(/[?#].*$/, ''));
      return inner.startsWith('file://') ? fileURLToPath(inner) : inner;
    }
    if (url.startsWith('file://')) return fileURLToPath(url.replace(/[?#].*$/, ''));
  } catch { /* not a path */ }
  return null;
}

const inside = (dir: string, file: string) => {
  const rel = path.relative(dir, file);
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
};

/** Resolves server frames for one project, keeping each map it read until the file changes. */
export function serverResolver(projectDir: string) {
  const root = path.resolve(projectDir);
  const cache = new Map<string, { mtimeMs: number; lookup: MapLookup | null }>();

  const lookupFor = (file: string): MapLookup | null => {
    let stat: fs.Stats;
    try { stat = fs.statSync(file); } catch { return null; }
    const hit = cache.get(file);
    if (hit && hit.mtimeMs === stat.mtimeMs) return hit.lookup;
    let lookup: MapLookup | null = null;
    try {
      // The map named by the file's own comment (inline or beside it), else "<file>.map"
      const tail = fs.readFileSync(file, 'utf8').slice(-4096);
      const ref = sourceMapRef(tail);
      let mapFile = `${file}.map`;
      let json: string | null = null;
      if (ref && 'inline' in ref) json = ref.inline;
      else if (ref) mapFile = path.resolve(path.dirname(file), decodeURIComponent(ref.url));
      if (!json && inside(root, mapFile) && mapFile.endsWith('.map') && fs.existsSync(mapFile)) json = fs.readFileSync(mapFile, 'utf8');
      lookup = json ? mapLookup(JSON.parse(json)) : null;
    } catch {
      lookup = null;
    }
    cache.set(file, { mtimeMs: stat.mtimeMs, lookup });
    return lookup;
  };

  /** One frame: the project file and line, or the module the address names, or null. */
  return (frame: ServerFrame): SourceLocation | null => {
    const file = serverFile(frame.url);
    // When the address names its module (Turbopack's "?id=[project]/..."), that is the file; a map that
    // says otherwise is out of step with the bundle (rebuilt since), so only its line is not trusted
    const mod = moduleIdPath(frame.url);
    if (file && inside(root, path.resolve(file))) {
      const hit = lookupFor(path.resolve(file))?.(frame.line, frame.column ?? 1);
      if (hit) {
        let src = projectPath(hit.source);
        if (path.isAbsolute(src)) src = path.relative(root, src).split(path.sep).join('/');
        if (src && !src.startsWith('..') && (!mod || src === mod)) return { file: src, line: hit.line, column: hit.column };
      }
    }
    return mod ? { file: mod } : null;
  };
}
