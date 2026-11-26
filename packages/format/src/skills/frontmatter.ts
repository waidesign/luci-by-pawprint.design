/**
 * Zero-dependency reader/writer for the YAML subset used in SKILL.md frontmatter:
 *   key: value              plain, "double" or 'single' quoted scalars
 *   key: [a, "b"]           inline lists
 *   key: >  |  >-  |-       multi-line (folded / literal) text
 *   key:                    followed by indented "- item" lists or "child: value" maps
 * Values are strings, lists of strings, or nested maps of those.
 */

export type FrontmatterValue = string | string[] | FrontmatterMap;
export interface FrontmatterMap {
  [key: string]: FrontmatterValue;
}

export interface ParsedFrontmatter {
  data: FrontmatterMap;
  content: string;
  hasFrontmatter: boolean;
  /** Exact source text of each top-level field, for lossless round-trips. */
  raw: Record<string, string>;
}

function unquote(value: string): string {
  const v = value.trim();
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    try {
      return String(JSON.parse(v));
    } catch {
      return v.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
    }
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) return v.slice(1, -1).replace(/''/g, "'");
  // Plain scalar: drop a trailing " # comment"
  return v.replace(/\s+#.*$/, '');
}

function parseInlineList(value: string): string[] {
  const inner = value.trim().slice(1, -1);
  if (!inner.trim()) return [];
  const items: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (const ch of inner) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ',') {
      items.push(unquote(current));
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) items.push(unquote(current));
  return items.filter(i => i !== '');
}

function parseScalarOrList(value: string): string | string[] {
  const v = value.trim();
  if (v.startsWith('[') && v.endsWith(']')) return parseInlineList(v);
  return unquote(v);
}

const indentOf = (line: string) => line.length - line.trimStart().length;

/** Collect a block scalar (">", "|", with optional "-"/"+" chomping) starting at `start`. */
function readBlockScalar(lines: readonly string[], start: number, indicator: string, parentIndent: number): { value: string; next: number } {
  const block: string[] = [];
  let i = start;
  let blockIndent: number | null = null;
  for (; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      block.push('');
      continue;
    }
    const ind = indentOf(line);
    if (ind <= parentIndent) break;
    if (blockIndent === null) blockIndent = ind;
    block.push(line.slice(Math.min(blockIndent, ind)));
  }
  while (block.length && block[block.length - 1] === '') block.pop();

  let text: string;
  if (indicator.startsWith('|')) {
    text = block.join('\n');
  } else {
    // Folded: single newlines become spaces, blank lines become newlines
    text = block.reduce((acc, line) => {
      if (line === '') return `${acc}\n`;
      if (acc === '' || acc.endsWith('\n')) return acc + line;
      return `${acc} ${line}`;
    }, '');
  }
  if (indicator.endsWith('+')) text += '\n';
  return { value: text.trim() === '' ? '' : text, next: i };
}

/** Parse a YAML mapping block (top level or nested). */
function parseMapping(lines: readonly string[], start: number, end: number, baseIndent: number): FrontmatterMap {
  const data: FrontmatterMap = {};
  let i = start;
  while (i < end) {
    const line = lines[i] ?? '';
    if (line.trim() === '' || line.trim().startsWith('#') || indentOf(line) !== baseIndent) {
      i++;
      continue;
    }
    const match = /^([^:]+?):(?:\s+(.*)|\s*)$/.exec(line.trim());
    if (!match?.[1]) {
      i++;
      continue;
    }
    const key = match[1].trim().replace(/^["']|["']$/g, '');
    const rest = (match[2] ?? '').trim();

    if (/^[>|][+-]?$/.test(rest)) {
      const { value, next } = readBlockScalar(lines, i + 1, rest, baseIndent);
      data[key] = value;
      i = next;
      continue;
    }

    if (rest === '') {
      // Look ahead: indented list or nested map
      let j = i + 1;
      while (j < end && (lines[j] ?? '').trim() === '') j++;
      const first = lines[j] ?? '';
      if (j < end && indentOf(first) > baseIndent) {
        const childIndent = indentOf(first);
        let k = j;
        while (k < end && ((lines[k] ?? '').trim() === '' || indentOf(lines[k] ?? '') >= childIndent)) k++;
        if (first.trim().startsWith('- ') || first.trim() === '-') {
          data[key] = lines.slice(j, k).filter(l => l.trim().startsWith('-')).map(l => unquote(l.trim().slice(1)));
        } else {
          data[key] = parseMapping(lines, j, k, childIndent);
        }
        i = k;
        continue;
      }
      data[key] = '';
      i++;
      continue;
    }

    data[key] = parseScalarOrList(rest);
    i++;
  }
  return data;
}

/** Split a markdown file into frontmatter data and body. */
export function parseFrontmatter(raw: string): ParsedFrontmatter {
  const text = String(raw ?? '').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  if (!text.startsWith('---')) return { data: {}, content: text, hasFrontmatter: false, raw: {} };

  const endIdx = text.indexOf('\n---', 3);
  if (endIdx === -1) return { data: {}, content: text, hasFrontmatter: false, raw: {} };

  const header = text.slice(3, endIdx).replace(/^\n/, '');
  const afterFence = text.indexOf('\n', endIdx + 4);
  const body = afterFence === -1 ? '' : text.slice(afterFence + 1);
  const lines = header.split('\n');

  const rawFields: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of lines) {
    const top = /^([^\s#:][^:]*):(\s|$)/.exec(line);
    if (top?.[1]) {
      current = top[1].trim();
      rawFields[current] = [line];
    } else if (current) {
      rawFields[current]?.push(line);
    }
  }
  const rawText = Object.fromEntries(Object.entries(rawFields).map(([k, v]) => [k, v.join('\n').replace(/\s+$/, '')]));

  return {
    data: parseMapping(lines, 0, lines.length, 0),
    content: body.replace(/^\n+/, '').replace(/\s+$/, ''),
    hasFrontmatter: true,
    raw: rawText
  };
}

const quote = (value: unknown) => JSON.stringify(String(value));

/**
 * Write frontmatter + body. Values are always double-quoted strings, lists are
 * inline, and plain objects become one-level nested maps (e.g. `metadata`).
 */
export function stringifyFrontmatter(data: Readonly<Record<string, unknown>>, content = ''): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map(quote).join(', ')}]`);
    } else if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined && v !== null && v !== '');
      if (entries.length === 0) continue;
      lines.push(`${key}:`);
      for (const [k, v] of entries) lines.push(`  ${k}: ${quote(v)}`);
    } else {
      lines.push(`${key}: ${quote(value)}`);
    }
  }
  lines.push('---', '');
  return `${lines.join('\n')}\n${String(content).replace(/^\n+/, '').replace(/\s+$/, '')}\n`;
}

/** A frontmatter value as a string ('' when it is a list or map). */
export const fmString = (v: FrontmatterValue | undefined): string => (typeof v === 'string' ? v : '');
/** A frontmatter value as a map ({} when it is not one). */
export const fmMap = (v: FrontmatterValue | undefined): FrontmatterMap =>
  v && typeof v === 'object' && !Array.isArray(v) ? v : {};
