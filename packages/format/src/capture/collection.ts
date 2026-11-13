/**
 * The basket export (FR18, FR19): several captures, from any pages and sites, in one file with
 * `scope: collection`. Items are grouped by type; each keeps its own source page. Browser-safe.
 */
import { z } from 'zod';
import { parseFrontmatter } from '../skills/frontmatter.js';
import { fail, ok, type ParseResult } from '../result.js';
import { CAPTURE_EXTENSION, cleanSource, deeperHeadings, formatCapture, toCaptureName } from './format.js';
import { captureSchema, type Capture, type CaptureSettings } from './schema.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** One basket item: a capture plus the name the user gave it. */
export const basketItemSchema = z.object({
  id: z.string().min(1),
  /** The name shown in the basket and used as the item's heading; the user can rename it. */
  name: z.string().trim().min(1),
  addedAt: isoDate,
  capture: captureSchema,
  /** The file as the user edited it by hand in the toolbar; exports use it instead of the generated text. */
  edited: z.string().min(1).optional()
});
export type BasketItem = z.infer<typeof basketItemSchema>;

export const collectionSchema = z.object({
  name: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  captured: isoDate,
  items: z.array(basketItemSchema).min(1)
});
export type Collection = z.infer<typeof collectionSchema>;

/** Groups in export order. */
export const COLLECTION_GROUPS = ['Components', 'Text', 'Colors', 'Spacing', 'Systems', 'Pages'] as const;
export type CollectionGroup = (typeof COLLECTION_GROUPS)[number];

export function groupOf(capture: Capture): CollectionGroup {
  if (capture.meta.scope === 'page') return 'Pages';
  if (capture.meta.scope === 'component') return 'Components';
  if (capture.meta.scope === 'system') return 'Systems';
  return capture.meta.type === 'text' ? 'Text' : capture.meta.type === 'color' ? 'Colors' : 'Spacing';
}

/** An item's body (the hand-edited text when there is one) without frontmatter, headings one level down. */
function bodyOf(item: BasketItem, settings: CaptureSettings): string {
  const text = (item.edited ?? formatCapture(item.capture, settings)).replace(/\r\n/g, '\n');
  const body = text.replace(/^---\n[\s\S]*?\n---\n+/, '');
  return deeperHeadings(body).trim();
}

/** The basket as one file, by name: luci-basket.collection.design.md. */
export const collectionFileName = (name: string) => `${toCaptureName(name)}.collection${CAPTURE_EXTENSION}`;

/** The basket export. Throws when the collection does not match its schema. */
export function formatCollection(collection: Collection, settings: CaptureSettings = {}): string {
  const c = collectionSchema.parse(collection);
  const sources = [...new Set(c.items.map(i => cleanSource(i.capture.meta.source)))];
  const lines = [
    '---',
    `name: ${c.name}`,
    'scope: collection',
    `captured: ${c.captured}`,
    `items: ${c.items.length}`,
    `sources: [${sources.map(s => JSON.stringify(s)).join(', ')}]`,
    '---',
    ''
  ];
  for (const group of COLLECTION_GROUPS) {
    // Within a group, items from the same page stay together, in the order they were added
    const items = c.items.filter(i => groupOf(i.capture) === group);
    if (!items.length) continue;
    const order = [...new Set(items.map(i => cleanSource(i.capture.meta.source)))];
    items.sort((a, b) => order.indexOf(cleanSource(a.capture.meta.source)) - order.indexOf(cleanSource(b.capture.meta.source)));
    lines.push(`# ${group}`, '');
    for (const item of items) {
      const m = item.capture.meta;
      lines.push(
        `## ${item.name}`,
        `- source: ${cleanSource(m.source)}`,
        ...(m.selector ? [`- selector: \`${m.selector.replace(/`/g, "'")}\``] : []),
        `- type: ${m.scope} ${m.type} · method: ${m.method} · captured: ${m.captured}`,
        '',
        bodyOf(item, settings),
        ''
      );
    }
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export interface ParsedCollection {
  name: string;
  captured: string;
  items: number;
  sources: string[];
  /** Item headings by group. */
  groups: Record<string, string[]>;
}

/** Read a basket export: its frontmatter and that its item sections add up. */
export function parseCollection(text: string): ParseResult<ParsedCollection> {
  const fm = parseFrontmatter(text);
  if (!fm.hasFrontmatter || fm.data['scope'] !== 'collection') return fail('not a collection file (scope: collection)');
  const items = Number(fm.data['items']);
  const sources = Array.isArray(fm.data['sources']) ? fm.data['sources'] : [];
  const groups: Record<string, string[]> = {};
  let group: string | null = null;
  for (const line of fm.content.split('\n')) {
    const g = /^# (.+)$/.exec(line);
    const h = /^## (.+)$/.exec(line);
    if (g) { group = g[1]!.trim(); groups[group] = []; } else if (h && group) groups[group]!.push(h[1]!.trim());
  }
  const counted = Object.values(groups).reduce((n, list) => n + list.length, 0);
  if (!Number.isInteger(items) || items !== counted) return fail(`collection says ${fm.data['items']} items but has ${counted}`);
  const unknown = Object.keys(groups).filter(g => !(COLLECTION_GROUPS as readonly string[]).includes(g));
  if (unknown.length) return fail(`collection has unknown groups: ${unknown.join(', ')}`);
  return ok({ name: String(fm.data['name'] ?? ''), captured: String(fm.data['captured'] ?? ''), items, sources, groups });
}
