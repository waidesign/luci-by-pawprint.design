import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  byRef,
  feedbackItemSchema,
  formatFeedbackPrompt,
  formatLayoutPrompt,
  nextRef,
  type LayoutPromptInput,
  parseRef,
  refsIn,
  routeOf,
  type DetailLevel,
  type FeedbackItem
} from '@luci/format/feedback';

const dir = fileURLToPath(new URL('../fixtures/feedback/', import.meta.url));
const inputs = JSON.parse(fs.readFileSync(path.join(dir, 'prompt-inputs.json'), 'utf8')) as Record<string, { items: unknown[]; options: { detail: DetailLevel } }>;
const parsed = (name: string) => inputs[name]!.items.map(i => feedbackItemSchema.parse(i));

describe('feedback prompt: golden files are the spec (FR24, FR27, FR28)', () => {
  for (const [file, { options }] of Object.entries(inputs)) {
    it(file, () => {
      const golden = fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n');
      expect(formatFeedbackPrompt(parsed(file), options)).toBe(golden);
    });
  }

  it('opens with the counts, numbers every page, lists every ID once, and asks for the report', () => {
    const text = formatFeedbackPrompt(parsed('three-pages.standard.prompt.md'));
    expect(text.split('\n')[0]).toBe('# UI feedback: 3 pages, 6 items');
    expect(text).toContain('Do not stop after the first page.');
    expect([...text.matchAll(/^## Page (\d) of 3: (\S+)/gm)].map(m => [m[1], m[2]])).toEqual([['1', '/pricing'], ['2', '/'], ['3', '/checkout']]);
    expect(refsIn(text)).toEqual(['P1-A1', 'P1-A2', 'P2-A1', 'P2-A2', 'P3-A1', 'P3-A2']);
    expect(text).toContain('End with the number of items done out of 6.');
  });

  it('compact leaves out source and components; detailed adds styles', () => {
    const items = parsed('three-pages.standard.prompt.md');
    const compact = formatFeedbackPrompt(items, { detail: 'compact' });
    expect(compact).not.toMatch(/source:|components:|styles:/);
    expect(compact).toContain('  selector: main > section:nth-of-type(2) > button\n  text: "Start free trial"');
    expect(formatFeedbackPrompt(parsed('one-page.detailed.prompt.md'), { detail: 'detailed' })).toContain('styles: background-color rgb(15, 98, 254)');
    expect(() => formatFeedbackPrompt([])).toThrow(/No feedback items/);
  });
});

describe('layout prompt: the golden file is the spec', () => {
  const layoutInputs = JSON.parse(fs.readFileSync(path.join(dir, 'layout-prompt-inputs.json'), 'utf8')) as Record<string, LayoutPromptInput>;
  for (const [file, input] of Object.entries(layoutInputs)) {
    it(file, () => {
      expect(formatLayoutPrompt(input)).toBe(fs.readFileSync(path.join(dir, file), 'utf8').replace(/\r\n/g, '\n'));
    });
  }
  it('numbers the elements, keeps the note, and refuses an empty plan', () => {
    const input = Object.values(layoutInputs)[0]!;
    const text = formatLayoutPrompt(input);
    expect([...text.matchAll(/^## (\d)\. /gm)].map(m => m[1])).toEqual(['1', '2']);
    expect(text).toContain('Note: "Make the plans feel more spacious, and put Pro first"');
    expect(text).toContain('Report every element number (1 to 2)');
    expect(formatLayoutPrompt({ ...input, note: '' })).not.toContain('Note:');
    expect(() => formatLayoutPrompt({ ...input, elements: [] })).toThrow(/No layout changes/);
  });
});

describe('feedback items', () => {
  const base = parsed('three-pages.standard.prompt.md');

  it('refs: a route keeps its page number; a new route gets the next one; numbers continue on the page', () => {
    expect(nextRef([], '/pricing')).toBe('P1-A1');
    expect(nextRef(base, '/pricing')).toBe('P1-A3');
    expect(nextRef(base, '/checkout')).toBe('P3-A3');
    expect(nextRef(base, '/settings')).toBe('P4-A1');
    // After items are cleared, numbers are never reused on a page that still has items
    expect(nextRef(base.filter(i => i.ref !== 'P1-A2'), '/pricing')).toBe('P1-A2');
    expect(nextRef(base.filter(i => i.ref !== 'P1-A1'), '/pricing')).toBe('P1-A3');
    expect(parseRef('P12-A3')).toEqual({ page: 12, n: 3 });
    expect(parseRef('A3')).toBeNull();
    expect(byRef([{ ref: 'P2-A1' }, { ref: 'P1-A10' }, { ref: 'P1-A2' }]).map(i => i.ref)).toEqual(['P1-A2', 'P1-A10', 'P2-A1']);
  });

  it('routes: the path, plus a hash route; never the query', () => {
    expect(routeOf('http://localhost:5173/pricing?plan=pro#faq')).toBe('/pricing');
    expect(routeOf('http://localhost:3000/#/settings/team')).toBe('/#/settings/team');
    expect(routeOf('http://localhost:3000')).toBe('/');
  });

  it('the schema refuses a bad ref, an empty comment and unknown intents', () => {
    const one = inputs['three-pages.standard.prompt.md']!.items[0] as FeedbackItem;
    expect(feedbackItemSchema.safeParse({ ...one, ref: 'A1' }).success).toBe(false);
    expect(feedbackItemSchema.safeParse({ ...one, comment: '   ' }).success).toBe(false);
    expect(feedbackItemSchema.safeParse({ ...one, intent: 'complain' }).success).toBe(false);
    expect(feedbackItemSchema.safeParse({ ...one, id: '../x' }).success).toBe(false);
    const { thread: _t, ...noThread } = one;
    expect(feedbackItemSchema.parse(noThread).thread).toEqual([]);
  });
});
