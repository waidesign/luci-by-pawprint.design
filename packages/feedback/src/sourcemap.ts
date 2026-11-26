/**
 * Where a line of served code was written. A dev server (Vite, Next) serves transformed modules with
 * a source map; the browser's stack traces give the served line, not the one in the file. This reads
 * the module's map (inline, or the URL it names) and finds the original file, line and column. Small
 * and dependency-free: only the standard "mappings" (VLQ) format, no indexed maps.
 */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_VALUE = new Map([...B64].map((c, i) => [c, i]));

/** One mapped position: generated column, then source index, line and column (all 0-based). */
type Segment = [number, number, number, number];

/** Decode a map's "mappings" into segments per generated line. */
export function decodeMappings(mappings: string): Segment[][] {
  const lines: Segment[][] = [];
  let src = 0, srcLine = 0, srcCol = 0;
  for (const line of mappings.split(';')) {
    const segs: Segment[] = [];
    let genCol = 0;
    for (const part of line.split(',')) {
      if (!part) continue;
      const values: number[] = [];
      let value = 0, shift = 0;
      for (const ch of part) {
        const digit = B64_VALUE.get(ch);
        if (digit === undefined) throw new Error(`Not a source map mapping: "${part}"`);
        value += (digit & 31) << shift;
        if (digit & 32) { shift += 5; continue; }
        values.push(value & 1 ? -(value >>> 1) : value >>> 1);
        value = 0;
        shift = 0;
      }
      genCol += values[0] ?? 0;
      if (values.length >= 4) {
        src += values[1]!;
        srcLine += values[2]!;
        srcCol += values[3]!;
        segs.push([genCol, src, srcLine, srcCol]);
      }
    }
    lines.push(segs);
  }
  return lines;
}

export interface RawSourceMap {
  sources: string[];
  sourceRoot?: string;
  mappings: string;
}

/** The original position of a generated one (1-based line and column), or null when unmapped. */
export function originalPosition(map: RawSourceMap, decoded: Segment[][], line: number, column: number): { source: string; line: number; column: number } | null {
  const segs = decoded[line - 1];
  if (!segs?.length) return null;
  let best: Segment | null = null;
  for (const s of segs) {
    if (s[0] <= column - 1) best = s;
    else break;
  }
  best ??= segs[0]!;
  const source = map.sources[best[1]];
  if (source === undefined) return null;
  const root = map.sourceRoot ? map.sourceRoot.replace(/\/?$/, '/') : '';
  return { source: `${root}${source}`, line: best[2] + 1, column: best[3] + 1 };
}

/** A sectioned ("index") source map, as Turbopack writes: each section maps the code from its offset on. */
export interface IndexSourceMap {
  sections: { offset: { line: number; column: number }; map: RawSourceMap | IndexSourceMap }[];
}

export type Position = { source: string; line: number; column: number };
export type MapLookup = (line: number, column: number) => Position | null;

/**
 * A lookup for a parsed source map, plain or sectioned. Mappings are decoded on first use only
 * (a Turbopack chunk holds many modules; most are never asked about).
 */
export function mapLookup(json: unknown): MapLookup | null {
  const m = json as Partial<RawSourceMap & IndexSourceMap>;
  if (Array.isArray(m.sections)) {
    const sections = m.sections
      .map(s => ({ line: s.offset?.line ?? 0, column: s.offset?.column ?? 0, lookup: mapLookup(s.map) }))
      .filter((s): s is { line: number; column: number; lookup: MapLookup } => Boolean(s.lookup));
    return (line, column) => {
      // The last section starting at or before the position (offsets are 0-based)
      let hit: (typeof sections)[number] | undefined;
      for (const s of sections) {
        if (s.line < line - 1 || (s.line === line - 1 && s.column <= column - 1)) hit = s;
        else break;
      }
      if (!hit) return null;
      const relLine = line - hit.line;
      return hit.lookup(relLine, relLine === 1 ? column - hit.column : column);
    };
  }
  if (typeof m.mappings !== 'string' || !Array.isArray(m.sources)) return null;
  const map = m as RawSourceMap;
  let decoded: Segment[][] | null = null;
  return (line, column) => originalPosition(map, (decoded ??= decodeMappings(map.mappings)), line, column);
}

/** UTF-8 text from base64. */
const fromBase64 = (b64: string) => new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)));

/** Where a file's source map is: its sourceMappingURL comment (inline data, or a URL relative to the file). */
export function sourceMapRef(code: string): { inline: string } | { url: string } | null {
  const ref = /\/\/[#@] sourceMappingURL=(\S+)\s*$/.exec(code.trimEnd())?.[1];
  if (!ref) return null;
  const inline = /^data:application\/json[^,]*?(;base64)?,(.*)$/.exec(ref);
  if (inline) return { inline: inline[1] ? fromBase64(inline[2]!) : decodeURIComponent(inline[2]!) };
  return { url: ref };
}

/** The source map of a served module (fetched once per URL), or null when it has none or it cannot be read. */
export function sourceMapLoader(fetchText: (url: string) => Promise<string | null>) {
  const cache = new Map<string, Promise<MapLookup | null>>();
  const load = async (url: string) => {
    const code = await fetchText(url);
    if (!code) return null;
    const ref = sourceMapRef(code);
    if (!ref) return null;
    const text = 'inline' in ref ? ref.inline : await fetchText(new URL(ref.url, url).href);
    return text ? mapLookup(JSON.parse(text)) : null;
  };
  return async (url: string, line: number, column: number) => {
    if (!cache.has(url)) cache.set(url, load(url).catch(() => null));
    const lookup = await cache.get(url)!;
    return lookup ? lookup(line, column) : null;
  };
}
