/**
 * The page-grouped prompt (FR24, FR27, FR28): one header with the count of pages and items, the
 * items grouped by page (route and source file), each with its stable ID, and a closing request to
 * report every ID page by page. Pure: the same items and options always give the same text.
 */
import { byRef, parseRef, type DetailLevel, type FeedbackItem, type LayoutChange, type SourceLocation } from './schema.js';

export interface PromptOptions {
  /** How much each item says about its element (default "standard"). */
  detail?: DetailLevel;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** A quoted string on one line: inner quotes escaped, line breaks kept as "\n"-free continuation. */
const quote = (text: string) => `"${text.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s*\n\s*/g, ' / ')}"`;
const short = (text: string, max = 120) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
export const sourceText = (s: SourceLocation) => `${s.file}${s.line ? `:${s.line}${s.column ? `:${s.column}` : ''}` : ''}`;

/** One planned layout change, as a step: "move it before `main > section:nth-of-type(3)` (section): 3rd of 4 -> 2nd". */
export function layoutChangeText(c: LayoutChange): string {
  // Width and height are the size as rendered (border and padding included), as it was measured
  if (c.op === 'set') return `${c.property}${c.property === 'width' || c.property === 'height' ? ' as rendered' : ''} ${c.from} → ${c.to}${c.token ? ` (${c.token})` : ''}`;
  const ord = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;
  const where = c.position === 'first' ? 'to the start of its parent'
    : c.position === 'last' ? 'to the end of its parent'
    : `${c.position} ${c.sibling ? `\`${c.sibling.selector}\` (${c.sibling.element})` : 'its sibling'}`;
  return `move it ${where}: ${ord(c.from)} of ${c.of} → ${ord(c.to)}`;
}

/** The page's source file: its own, else none (an item's file is the component, not the page). */
const pageSource = (items: readonly FeedbackItem[]) => items.find(i => i.page.source)?.page.source;

function itemLines(item: FeedbackItem, detail: DetailLevel): string[] {
  const t = item.target;
  const lines = [`- [${item.ref}] ${item.intent}, ${item.priority}: ${quote(item.comment)}`];
  lines.push(`  selector: ${t.selector}`);
  if (t.kind === 'text' && t.selectedText) lines.push(`  selected text: ${quote(short(t.selectedText))}`);
  if (t.text) lines.push(`  text: ${quote(short(t.text))}`);
  else if (!(t.kind === 'text' && t.selectedText)) lines.push(`  element: ${t.element}`);
  if (detail !== 'compact') {
    if (t.source) lines.push(`  source: ${sourceText(t.source)}`);
    if (t.components?.length) lines.push(`  components: ${t.components.join(' > ')}`);
  }
  if (item.layout) {
    lines.push(`  layout, planned in a ${item.layout.viewport.width}px wide window (keep it working at other widths):`);
    for (const c of item.layout.changes) lines.push(`    - ${layoutChangeText(c)}`);
  }
  if (detail === 'detailed' && t.styles && Object.keys(t.styles).length) {
    lines.push(`  styles: ${Object.entries(t.styles).map(([k, v]) => `${k} ${v}`).join('; ')}`);
  }
  if (item.thread.length) {
    // From the earlier agent sync: older notes may still hold a question and its answer
    for (const m of item.thread) lines.push(`  ${m.from === 'agent' ? 'you asked' : 'answer'}: ${quote(m.text)}`);
  }
  return lines;
}

/** The prompt for these items (the caller picks which: pending ones, or all). Throws on an empty list. */
export function formatFeedbackPrompt(items: readonly FeedbackItem[], options: PromptOptions = {}): string {
  if (!items.length) throw new Error('No feedback items to put in a prompt.');
  const detail = options.detail ?? 'standard';
  const pages = new Map<number, FeedbackItem[]>();
  for (const item of byRef(items)) {
    const page = parseRef(item.ref)!.page;
    pages.set(page, [...(pages.get(page) ?? []), item]);
  }
  const count = pages.size;
  const total = items.length;
  const out = [
    `# UI feedback: ${plural(count, 'page')}, ${plural(total, 'item')}`,
    count > 1
      ? `Apply every item below, on all ${count} pages. Do not stop after the first page.`
      : 'Apply every item below.'
  ];
  let i = 0;
  for (const [number, list] of pages) {
    i++;
    const first = list[0]!;
    const source = pageSource(list);
    // The ID keeps the page's number in the session; say so when this prompt numbers pages differently
    const ids = number === i ? '' : ` (item IDs start with P${number})`;
    out.push('', `## Page ${i} of ${count}: ${first.page.route}${source ? `  (${source})` : ''}${ids}`);
    for (const item of list) out.push(...itemLines(item, detail));
  }
  out.push(
    '',
    '## When done',
    `Report every item ID as done, skipped or blocked, grouped by page,`,
    `and name the route to open to verify it.`,
    `End with the number of items done out of ${total}.`
  );
  return `${out.join('\n')}\n`;
}

/** Every item ID a text mentions ("[P2-A3]", "P1-A1"), once each, in order. */
export function refsIn(text: string): string[] {
  return [...new Set([...text.matchAll(/\bP\d+-A\d+\b/g)].map(m => m[0]))];
}
