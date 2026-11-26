/**
 * Team Feedback review format, resilient parser, duplicate merger, and untrusted-text sanitizer.
 *
 * Human-readable text comes first (header + numbered list), followed by one compact `luci-review`
 * fenced NDJSON block holding anchors and measured values. If the block is edited, mangled by
 * Slack/email, or deleted, parsing degrades cleanly to plain-text notes without anchors and never
 * throws. Browser-safe: no Node imports.
 */
import { z } from 'zod';
import { REVIEWER_ROLES, routeOf, type ReviewerRole } from './schema.js';

export const REVIEW_FORMAT_VERSION = 1 as const;
export const REVIEW_FENCE = 'luci-review';

export const reviewMeasurementsSchema = z.object({
  color: z.string().min(1).optional(),
  background: z.string().min(1).optional(),
  fontFamily: z.string().min(1).optional(),
  fontSize: z.string().min(1).optional(),
  fontWeight: z.string().min(1).optional(),
  padding: z.string().min(1).optional(),
  margin: z.string().min(1).optional(),
  gap: z.string().min(1).optional(),
  borderRadius: z.string().min(1).optional()
});
export type ReviewMeasurements = z.infer<typeof reviewMeasurementsSchema>;

export const reviewAnchorSchema = z.object({
  element: z.string().min(1).optional(),
  text: z.string().min(1).optional(),
  component: z.string().min(1).optional(),
  selector: z.string().min(1).optional(),
  position: z.tuple([z.number(), z.number()]).optional(),
  /** Where in the element the reviewer clicked, as fractions of its width and height (0-1), for the marker. */
  point: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional()
});
export type ReviewAnchor = z.infer<typeof reviewAnchorSchema>;

export const reviewNoteSchema = z.object({
  id: z.string().min(1),
  path: z.string().min(1),
  note: z.string().trim().min(1),
  anchor: reviewAnchorSchema.optional(),
  measured: reviewMeasurementsSchema.optional(),
  url: z.string().min(1).optional(),
  viewport: z.string().min(1).optional(),
  browser: z.string().min(1).optional(),
  createdAt: z.string().min(1).optional()
});
export type ReviewNote = z.infer<typeof reviewNoteSchema>;

export const reviewerIdentitySchema = z.object({
  name: z.string().trim().min(1).max(80),
  role: z.enum(REVIEWER_ROLES)
});
export type ReviewerIdentity = z.infer<typeof reviewerIdentitySchema>;

export const teamReviewSchema = z.object({
  version: z.literal(REVIEW_FORMAT_VERSION),
  reviewer: reviewerIdentitySchema,
  site: z.string().min(1),
  createdAt: z.string().min(1),
  viewport: z.string().min(1).optional(),
  browser: z.string().min(1).optional(),
  notes: z.array(reviewNoteSchema),
  degraded: z.boolean().optional(),
  warning: z.string().optional()
});
export type TeamReview = z.infer<typeof teamReviewSchema>;

export interface MergedReviewNoteEntry {
  reviewerName: string;
  role: ReviewerRole;
  text: string;
  site: string;
  createdAt: string;
  reviewIndex: number;
}

export interface MergedReviewNote {
  id: string;
  path: string;
  note: string;
  entries: MergedReviewNoteEntry[];
  reviewers: ReviewerIdentity[];
  roles: ReviewerRole[];
  anchor?: ReviewAnchor;
  measured?: ReviewMeasurements;
  site: string;
  url?: string;
  createdAt: string;
  viewport?: string;
  browser?: string;
  degraded?: boolean;
}

/** Escape untrusted reviewer words so they cannot inject markdown headings, fences, or control chars. */
export function sanitizeReviewerText(text: string): string {
  return text
    // Strip ASCII control characters except whitespace
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
    // Neutralize fenced code blocks so reviewer text cannot break out of prompts or blocks
    .replace(/```+/g, "'''")
    .replace(/~~~+/g, '---')
    // Neutralize leading markdown headings on any line
    .replace(/(^|\n)\s{0,3}(#{1,6}\s)/g, '$1\\$2')
    .replace(/\r\n?/g, '\n')
    .trim();
}

/** Single-line cleaned version of untrusted reviewer text for inline display or prompt quoting. */
export function sanitizeReviewerInline(text: string): string {
  return sanitizeReviewerText(text).replace(/\s*\n+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

const shortText = (value: string | undefined, max = 96): string | undefined => {
  if (!value) return undefined;
  const clean = value.replace(/\s+/g, ' ').trim();
  if (!clean) return undefined;
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
};

/** Normalize a route/path: always starts with /, strips trailing slash except root, keeps hash route. */
export function normalizeReviewPath(pathOrUrl: string): string {
  // A path is untrusted reviewer input too: one line, no fences or headings (B-54)
  const trimmed = sanitizeReviewerInline(pathOrUrl).replace(/\s+/g, '');
  if (!trimmed) return '/';
  const raw = /^https?:\/\//i.test(trimmed) ? routeOf(trimmed) : trimmed;
  const withoutQuery = raw.includes('#/') ? raw : raw.split('?')[0]!.split('#')[0]!;
  const prefixed = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
  return prefixed.length > 1 && prefixed.endsWith('/') ? prefixed.slice(0, -1) : prefixed;
}

const datePart = (iso: string): string => {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso.trim());
  return m ? m[1]! : iso.slice(0, 10) || 'unknown';
};

const safeJsonLine = (obj: Record<string, unknown>): string =>
  JSON.stringify(obj).replace(/```/g, '\\u0060\\u0060\\u0060');

const compactMeasured = (m?: ReviewMeasurements): Record<string, string> | undefined => {
  if (!m) return undefined;
  const out: Record<string, string> = {};
  if (m.color) out.c = m.color;
  if (m.background) out.bg = m.background;
  if (m.fontFamily) out.ff = m.fontFamily;
  if (m.fontSize) out.fs = m.fontSize;
  if (m.fontWeight) out.fw = m.fontWeight;
  if (m.padding) out.pd = m.padding;
  if (m.margin) out.mg = m.margin;
  if (m.gap) out.gp = m.gap;
  if (m.borderRadius) out.br = m.borderRadius;
  return Object.keys(out).length ? out : undefined;
};

const expandMeasured = (raw: unknown): ReviewMeasurements | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === 'string' && r[k].trim() ? r[k].trim() : undefined);
  const out: ReviewMeasurements = {};
  const color = str('c') ?? str('color');
  const background = str('bg') ?? str('background');
  const fontFamily = str('ff') ?? str('fontFamily');
  const fontSize = str('fs') ?? str('fontSize');
  const fontWeight = str('fw') ?? str('fontWeight');
  const padding = str('pd') ?? str('padding');
  const margin = str('mg') ?? str('margin');
  const gap = str('gp') ?? str('gap');
  const borderRadius = str('br') ?? str('borderRadius');
  if (color) out.color = color;
  if (background) out.background = background;
  if (fontFamily) out.fontFamily = fontFamily;
  if (fontSize) out.fontSize = fontSize;
  if (fontWeight) out.fontWeight = fontWeight;
  if (padding) out.padding = padding;
  if (margin) out.margin = margin;
  if (gap) out.gap = gap;
  if (borderRadius) out.borderRadius = borderRadius;
  return Object.keys(out).length ? out : undefined;
};

/** Format a Team Review as human-readable text plus one compact `luci-review` fenced NDJSON block. */
export function formatTeamReview(review: TeamReview): string {
  const count = review.notes.length;
  const noteWord = count === 1 ? 'note' : 'notes';
  const name = sanitizeReviewerInline(review.reviewer.name) || 'Reviewer';
  const role = review.reviewer.role;
  const site = review.site.trim() || 'unknown';
  const date = datePart(review.createdAt);

  const lines: string[] = [
    `Luci Review — ${name} (${role})`,
    `Site: ${site} · Date: ${date} · ${count} ${noteWord}`,
    ''
  ];

  review.notes.forEach((n, idx) => {
    const p = normalizeReviewPath(n.path);
    lines.push(`${idx + 1}. [${p}] ${sanitizeReviewerInline(n.note)}`);
  });

  const headerObj: Record<string, unknown> = {
    v: REVIEW_FORMAT_VERSION,
    r: name,
    role,
    site,
    at: review.createdAt
  };
  if (review.viewport) headerObj.vp = review.viewport;
  if (review.browser) headerObj.br = review.browser;

  const blockLines: string[] = [safeJsonLine(headerObj)];
  review.notes.forEach((n, idx) => {
    const row: Record<string, unknown> = {
      n: idx + 1,
      p: normalizeReviewPath(n.path)
    };
    if (n.anchor?.element) row.el = shortText(n.anchor.element, 48);
    if (n.anchor?.text) row.txt = shortText(n.anchor.text, 80);
    if (n.anchor?.component) row.cmp = shortText(n.anchor.component, 48);
    if (n.anchor?.selector) row.sel = shortText(n.anchor.selector, 160);
    if (n.anchor?.position) row.pos = [Math.round(n.anchor.position[0]), Math.round(n.anchor.position[1])];
    const m = compactMeasured(n.measured);
    if (m) row.m = m;
    if (n.viewport && n.viewport !== review.viewport) row.vp = n.viewport;
    if (n.createdAt && n.createdAt !== review.createdAt) row.at = n.createdAt;
    blockLines.push(safeJsonLine(row));
  });

  lines.push('', `\`\`\`${REVIEW_FENCE}`, ...blockLines, '```');
  return lines.join('\n');
}

function normalizeRole(value: unknown): ReviewerRole {
  if (typeof value !== 'string') return 'Stakeholder';
  const clean = value.trim().toLowerCase();
  const match = REVIEWER_ROLES.find(r => r.toLowerCase() === clean);
  if (match) return match;
  if (clean === 'dev' || clean === 'engineer' || clean === 'eng') return 'Developer';
  if (clean === 'product' || clean === 'product manager') return 'PM';
  if (clean === 'design') return 'Designer';
  if (clean === 'customer') return 'Client';
  return 'Stakeholder';
}

/** Repair common Slack/email mangling (smart quotes, NBSP, zero-width spaces). */
function normalizePastedText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function splitReviewChunks(text: string): string[] {
  const lines = text.split('\n');
  const chunks: string[][] = [];
  let current: string[] = [];
  let inFence = false;

  const isHeader = (line: string) => /^Luci Review\s*[—–\-:]/i.test(line.trim());

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^```/.test(trimmed)) {
      if (!inFence && /^```luci-review\b/i.test(trimmed)) {
        // If current chunk already closed a previous luci-review block, start a new chunk.
        if (current.some(l => /^```luci-review\b/i.test(l.trim()))) {
          chunks.push(current);
          current = [];
        }
        inFence = true;
      } else if (inFence) {
        inFence = false;
      }
      current.push(line);
      continue;
    }
    if (!inFence && isHeader(line) && current.some(l => l.trim().length > 0)) {
      chunks.push(current);
      current = [line];
      continue;
    }
    current.push(line);
  }
  if (current.some(l => l.trim().length > 0)) chunks.push(current);
  return chunks.map(c => c.join('\n').trim()).filter(Boolean);
}

interface HumanParsed {
  name?: string;
  role?: ReviewerRole;
  site?: string;
  date?: string;
  notes: { n: number; path?: string; note: string }[];
}

function parseHumanSection(text: string): HumanParsed {
  const out: HumanParsed = { notes: [] };
  const lines = text.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const headerMatch = /^Luci Review\s*[—–\-:]\s*(.+?)(?:\s*\(([^)]+)\))?\s*$/i.exec(line);
    if (headerMatch) {
      out.name = headerMatch[1]!.trim();
      if (headerMatch[2]) out.role = normalizeRole(headerMatch[2]);
      continue;
    }

    const metaMatch = /^Site:\s*(\S+)(?:.*?Date:\s*(\d{4}-\d{2}-\d{2}))?/i.exec(line);
    if (metaMatch) {
      out.site = sanitizeReviewerInline(metaMatch[1]!.replace(/[·,|]+$/, ''));
      if (metaMatch[2]) out.date = metaMatch[2];
      continue;
    }

    const numbered = /^(\d+)[.)]\s+(?:\[([^\]]+)\]\s*)?(.+)$/.exec(line);
    if (numbered) {
      const note = numbered[3]!.trim();
      if (note) {
        out.notes.push({
          n: Number(numbered[1]),
          path: numbered[2] ? normalizeReviewPath(numbered[2]) : undefined,
          note
        });
      }
      continue;
    }

    const bulleted = /^[-*•]\s+(?:\[([^\]]+)\]\s*)?(.+)$/.exec(line);
    if (bulleted) {
      const note = bulleted[2]!.trim();
      if (note) {
        out.notes.push({
          n: out.notes.length + 1,
          path: bulleted[1] ? normalizeReviewPath(bulleted[1]) : undefined,
          note
        });
      }
    }
  }
  return out;
}

interface MachineParsed {
  header?: {
    version: number;
    name?: string;
    role?: ReviewerRole;
    site?: string;
    createdAt?: string;
    viewport?: string;
    browser?: string;
  };
  notes: Map<number, ReviewNote>;
  hadBlock: boolean;
  damagedLines: number;
  unclosed: boolean;
}

/** A string field from a pasted luci-review line, cleaned to one safe line; undefined when empty. */
const inlineField = (value: unknown): string | undefined =>
  typeof value === 'string' ? sanitizeReviewerInline(value) || undefined : undefined;

function parseMachineBlock(blockBody: string, unclosed: boolean): MachineParsed {
  const notes = new Map<number, ReviewNote>();
  let header: MachineParsed['header'];
  let damagedLines = 0;
  let autoIndex = 1;

  for (const rawLine of blockBody.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line) as Record<string, unknown>;
      if (typeof obj !== 'object' || obj === null) {
        damagedLines++;
        continue;
      }
      if ('v' in obj && !('n' in obj) && !('note' in obj)) {
        header = {
          version: typeof obj.v === 'number' ? obj.v : REVIEW_FORMAT_VERSION,
          name: inlineField(obj.r),
          role: obj.role ? normalizeRole(obj.role) : undefined,
          site: inlineField(obj.site),
          createdAt: inlineField(obj.at),
          viewport: inlineField(obj.vp),
          browser: inlineField(obj.br)
        };
        continue;
      }
      const noteText = typeof obj.note === 'string' ? obj.note.trim() : '';
      const hasN = typeof obj.n === 'number' && Number.isFinite(obj.n) && obj.n > 0;
      if (!noteText && !hasN) {
        damagedLines++;
        continue;
      }
      const n = hasN ? Math.floor(obj.n as number) : autoIndex;
      autoIndex = Math.max(autoIndex, n + 1);

      // Every anchor field is untrusted reviewer input that reaches the agent prompt: one line, no
      // fences or headings, like the note itself (B-54)
      const anchor: ReviewAnchor = {};
      const element = inlineField(obj.el), text = inlineField(obj.txt), component = inlineField(obj.cmp), selector = inlineField(obj.sel);
      if (element) anchor.element = element;
      if (text) anchor.text = text;
      if (component) anchor.component = component;
      if (selector) anchor.selector = selector;
      if (Array.isArray(obj.pos) && obj.pos.length === 2 && typeof obj.pos[0] === 'number' && typeof obj.pos[1] === 'number') {
        anchor.position = [obj.pos[0], obj.pos[1]];
      }

      const measured = expandMeasured(obj.m);
      const path = typeof obj.p === 'string' && obj.p.trim() ? normalizeReviewPath(obj.p) : '/';
      notes.set(n, {
        id: `n-${n}`,
        path,
        note: noteText,
        anchor: Object.keys(anchor).length ? anchor : undefined,
        measured,
        viewport: inlineField(obj.vp),
        createdAt: inlineField(obj.at)
      });
    } catch {
      damagedLines++;
    }
  }

  return { header, notes, hadBlock: true, damagedLines, unclosed };
}

function parseSingleReviewChunk(chunk: string, chunkIdx: number, fallbackDateIso: string): TeamReview | null {
  const fenceStart = /```luci-review[^\n]*\n?/i.exec(chunk);
  let humanPart = chunk;
  let machine: MachineParsed = { notes: new Map(), hadBlock: false, damagedLines: 0, unclosed: false };

  if (fenceStart) {
    humanPart = chunk.slice(0, fenceStart.index);
    const afterStart = chunk.slice(fenceStart.index + fenceStart[0].length);
    const fenceEnd = /\n```(?:\s|$)/.exec(afterStart);
    const blockBody = fenceEnd ? afterStart.slice(0, fenceEnd.index) : afterStart;
    if (fenceEnd) {
      const trailing = afterStart.slice(fenceEnd.index + fenceEnd[0].length).trim();
      if (trailing) humanPart = `${humanPart}\n${trailing}`;
    }
    machine = parseMachineBlock(blockBody, !fenceEnd);
  }

  const human = parseHumanSection(humanPart);

  // Merge machine notes + human notes so human edits survive and damaged lines fall back to plain text.
  const combined: ReviewNote[] = [];
  const usedMachine = new Set<number>();

  if (human.notes.length > 0) {
    for (const hn of human.notes) {
      const mn = machine.notes.get(hn.n);
      if (mn) {
        usedMachine.add(hn.n);
        combined.push({
          ...mn,
          id: `r${chunkIdx}-n${hn.n}`,
          path: hn.path ?? mn.path ?? '/',
          note: hn.note
        });
      } else {
        combined.push({
          id: `r${chunkIdx}-n${hn.n}`,
          path: hn.path ?? '/',
          note: hn.note
        });
      }
    }
    // Include any machine notes that carry note text and weren't in the human list
    for (const [n, mn] of [...machine.notes.entries()].sort((a, b) => a[0] - b[0])) {
      if (!usedMachine.has(n) && mn.note) {
        combined.push({ ...mn, id: `r${chunkIdx}-n${n}` });
      }
    }
  } else if (machine.notes.size > 0) {
    for (const [n, mn] of [...machine.notes.entries()].sort((a, b) => a[0] - b[0])) {
      if (mn.note) combined.push({ ...mn, id: `r${chunkIdx}-n${n}` });
    }
  } else {
    // Pure freeform plain text fallback (no numbered list and no machine block)
    const plainLines = humanPart
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && !/^Luci Review\b/i.test(l) && !/^Site:/i.test(l) && !/^```/.test(l));
    plainLines.forEach((line, idx) => {
      combined.push({ id: `r${chunkIdx}-n${idx + 1}`, path: '/', note: line });
    });
  }

  if (combined.length === 0) return null;

  const site = machine.header?.site ?? human.site ?? 'unknown';
  const name = sanitizeReviewerInline(machine.header?.name ?? human.name ?? 'Reviewer') || 'Reviewer';
  const role = machine.header?.role ?? human.role ?? 'Stakeholder';
  const createdAt = machine.header?.createdAt ?? (human.date ? `${human.date}T00:00:00.000Z` : fallbackDateIso);

  const notesWithMeta = combined.map(n => ({
    ...n,
    url: n.url ?? (site !== 'unknown' ? `${site.replace(/\/$/, '')}${n.path}` : undefined),
    viewport: n.viewport ?? machine.header?.viewport,
    browser: n.browser ?? machine.header?.browser,
    createdAt: n.createdAt ?? createdAt
  }));

  const anyUnanchored = notesWithMeta.some(n => !n.anchor);
  const degraded = !machine.hadBlock || machine.damagedLines > 0 || machine.unclosed || anyUnanchored;
  let warning: string | undefined;
  if (!machine.hadBlock) {
    warning = 'Imported as plain text without element anchors (no luci-review data block found).';
  } else if (machine.damagedLines > 0 || machine.unclosed) {
    warning = 'Part of the luci-review block was edited or damaged; affected notes were imported as plain text.';
  }

  return {
    version: REVIEW_FORMAT_VERSION,
    reviewer: { name, role },
    site,
    createdAt,
    viewport: machine.header?.viewport,
    browser: machine.header?.browser,
    notes: notesWithMeta,
    degraded: degraded || undefined,
    warning
  };
}

/**
 * Parse one or more pasted reviews. Always returns whatever readable notes could be extracted,
 * degrading gracefully to plain text without anchors when the machine block is missing or damaged.
 */
export function parseTeamReviews(rawText: string, nowIso = new Date().toISOString()): TeamReview[] {
  const normalized = normalizePastedText(rawText).trim();
  if (!normalized) return [];
  const chunks = splitReviewChunks(normalized);
  const results: TeamReview[] = [];
  chunks.forEach((chunk, idx) => {
    const parsed = parseSingleReviewChunk(chunk, idx + 1, nowIso);
    if (parsed) results.push(parsed);
  });
  return results;
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'this', 'that', 'these', 'those', 'it', 'its', 'in', 'on', 'at', 'to',
  'of', 'for', 'with', 'from', 'by', 'about', 'as', 'into', 'here', 'there',
  'and', 'or', 'but', 'if', 'so', 'not', 'no', 'very', 'too', 'more', 'less',
  'just', 'really', 'quite', 'looks', 'look', 'feels', 'feel', 'seems', 'seem',
  'should', 'could', 'would', 'can', 'need', 'needs', 'make', 'please', 'bit', 'little'
]);

const ELEMENT_NOUNS = new Set([
  'button', 'btn', 'cta', 'card', 'cards', 'link', 'links', 'banner', 'hero',
  'section', 'page', 'box', 'item', 'items', 'element', 'container', 'header',
  'footer', 'nav', 'navbar', 'menu', 'modal', 'dialog', 'icon', 'icons', 'image',
  'img', 'input', 'field', 'form', 'tab', 'tabs', 'badge', 'tag', 'row', 'column'
]);

const SYNONYMS: Record<string, string> = {
  small: 'size-down', smaller: 'size-down', tiny: 'size-down', big: 'size-up', bigger: 'size-up', large: 'size-up', larger: 'size-up', size: 'size', sizing: 'size',
  font: 'text', typeface: 'text', typography: 'text', copy: 'text', label: 'text', text: 'text', wording: 'text',
  color: 'color', colour: 'color', contrast: 'color', dark: 'color-dark', darker: 'color-dark', light: 'color-light', lighter: 'color-light', faint: 'color-light', pale: 'color-light', readable: 'color', readability: 'color',
  space: 'spacing', spacing: 'spacing', padding: 'spacing', margin: 'spacing', gap: 'spacing', tight: 'spacing', cramped: 'spacing', crowded: 'spacing', close: 'spacing', breathable: 'spacing',
  radius: 'radius', corner: 'radius', corners: 'radius', round: 'radius-up', rounded: 'radius-up', sharp: 'radius-down', sharper: 'radius-down', square: 'radius-down',
  align: 'align', aligned: 'align', alignment: 'align', center: 'align', centered: 'align', centred: 'align', offset: 'align', misaligned: 'align', crooked: 'align',
  typo: 'typo', spelling: 'typo', misspelled: 'typo', mispelled: 'typo', grammar: 'typo',
  bold: 'weight', bolder: 'weight', weight: 'weight', thin: 'weight', heavy: 'weight',
  overlap: 'overlap', overlapping: 'overlap', clipped: 'overlap', cut: 'overlap', truncated: 'overlap', overflow: 'overlap'
};

function intentTokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
  const filtered = words.filter(w => !ELEMENT_NOUNS.has(w));
  const base = filtered.length > 0 ? filtered : words;
  return new Set(base.map(w => SYNONYMS[w] ?? w));
}

function sameElementAnchor(a?: ReviewAnchor, b?: ReviewAnchor): boolean {
  if (!a || !b) return false;
  if (a.selector && b.selector && a.selector.trim() === b.selector.trim()) return true;
  const norm = (s?: string) => s?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
  const elA = norm(a.element).split(' ')[0];
  const elB = norm(b.element).split(' ')[0];
  const txtA = norm(a.text);
  const txtB = norm(b.text);
  if (a.component && b.component && norm(a.component) === norm(b.component) && txtA && txtA === txtB) return true;
  if (elA && elA === elB && txtA && txtA === txtB) return true;
  if (elA && elA === elB && a.position && b.position) {
    if (txtA && txtB && txtA !== txtB) return false;
    const dx = Math.abs(a.position[0] - b.position[0]);
    const dy = Math.abs(a.position[1] - b.position[1]);
    if (dx <= 8 && dy <= 8) return true;
  }
  return false;
}

function sameMeaning(a: string, b: string, anchored: boolean): boolean {
  const cleanA = sanitizeReviewerInline(a).toLowerCase();
  const cleanB = sanitizeReviewerInline(b).toLowerCase();
  if (cleanA === cleanB) return true;

  const ta = intentTokens(a);
  const tb = intentTokens(b);
  if (ta.size === 0 || tb.size === 0) return false;

  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  if (shared === 0) return false;

  const union = ta.size + tb.size - shared;
  const jaccard = shared / union;
  const minSize = Math.min(ta.size, tb.size);
  const containment = shared / minSize;

  if (!anchored) return jaccard >= 0.75;
  // On the same element, avoid merging solely on generic "text" when one is about size and the other is about a typo.
  if (shared === 1 && ta.has('text') && tb.has('text') && (ta.size > 1 || tb.size > 1)) return false;
  return jaccard >= 0.45 || (containment >= 0.7 && shared >= 1);
}

function richestAnchor(a?: ReviewAnchor, b?: ReviewAnchor): ReviewAnchor | undefined {
  if (!a) return b;
  if (!b) return a;
  return {
    element: a.element ?? b.element,
    text: a.text ?? b.text,
    component: a.component ?? b.component,
    selector: a.selector ?? b.selector,
    position: a.position ?? b.position
  };
}

function mergeMeasurements(a?: ReviewMeasurements, b?: ReviewMeasurements): ReviewMeasurements | undefined {
  if (!a) return b;
  if (!b) return a;
  return { ...b, ...a };
}

/**
 * Merge duplicate notes across one or more reviews (same page, same element, same meaning).
 * Preserves every reviewer's name and role for Builder display, and unique roles for agent hand-off.
 */
export function mergeReviewNotes(reviews: readonly TeamReview[]): MergedReviewNote[] {
  const groups: MergedReviewNote[] = [];

  reviews.forEach((review, reviewIndex) => {
    for (const note of review.notes) {
      const path = normalizeReviewPath(note.path);
      const entry: MergedReviewNoteEntry = {
        reviewerName: review.reviewer.name,
        role: review.reviewer.role,
        text: note.note,
        site: review.site,
        createdAt: note.createdAt ?? review.createdAt,
        reviewIndex
      };

      const existing = groups.find(g => {
        if (g.path !== path) return false;
        const anchored = sameElementAnchor(g.anchor, note.anchor);
        if (!anchored && (g.anchor || note.anchor)) return false;
        return g.entries.some(e => sameMeaning(e.text, note.note, anchored));
      });

      if (existing) {
        existing.entries.push(entry);
        if (!existing.reviewers.some(r => r.name.toLowerCase() === review.reviewer.name.toLowerCase() && r.role === review.reviewer.role)) {
          existing.reviewers.push({ ...review.reviewer });
        }
        if (!existing.roles.includes(review.reviewer.role)) {
          existing.roles.push(review.reviewer.role);
        }
        existing.anchor = richestAnchor(existing.anchor, note.anchor);
        existing.measured = mergeMeasurements(existing.measured, note.measured);
        if (entry.createdAt > existing.createdAt) existing.createdAt = entry.createdAt;
      } else {
        groups.push({
          id: `merged-${groups.length + 1}`,
          path,
          note: note.note,
          entries: [entry],
          reviewers: [{ ...review.reviewer }],
          roles: [review.reviewer.role],
          anchor: note.anchor ? { ...note.anchor } : undefined,
          measured: note.measured ? { ...note.measured } : undefined,
          site: review.site,
          url: note.url,
          createdAt: entry.createdAt,
          viewport: note.viewport ?? review.viewport,
          browser: note.browser ?? review.browser,
          degraded: review.degraded
        });
      }
    }
  });

  return groups;
}

/**
 * Format a merged note's comment for saving to `.luci/feedback/` and handing off to an agent.
 * Includes roles only (never personal names) and escapes untrusted reviewer text.
 */
export function formatAgentNoteComment(merged: Pick<MergedReviewNote, 'entries' | 'note'>): string {
  const uniqueTexts: string[] = [];
  for (const e of merged.entries) {
    const clean = sanitizeReviewerInline(e.text);
    if (clean && !uniqueTexts.some(t => t.toLowerCase() === clean.toLowerCase())) {
      uniqueTexts.push(clean);
    }
  }
  if (uniqueTexts.length <= 1) return uniqueTexts[0] ?? sanitizeReviewerInline(merged.note);
  return uniqueTexts.join(' / ');
}
