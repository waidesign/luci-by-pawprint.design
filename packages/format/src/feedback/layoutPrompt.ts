/**
 * The Layout mode prompt (changed 13 Nov 2026): every layout change planned on one page, element by
 * element, with exact steps and the person's note, ready to paste to an agent. Pure.
 */
import { layoutChangeText, sourceText } from './prompt.js';
import type { LayoutChange, SourceLocation } from './schema.js';

export interface LayoutPromptElement {
  /** "div (region)" */
  element: string;
  selector: string;
  text?: string;
  components?: readonly string[];
  source?: SourceLocation;
  changes: readonly LayoutChange[];
}

export interface LayoutPromptInput {
  route: string;
  /** The page component's file, when known. */
  pageSource?: string;
  viewport: { width: number; height: number };
  /** What the person wrote about the whole plan. */
  note?: string;
  elements: readonly LayoutPromptElement[];
}

const quote = (text: string) => `"${text.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s*\n\s*/g, ' / ')}"`;
const short = (text: string, max = 120) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export function formatLayoutPrompt(input: LayoutPromptInput): string {
  const elements = input.elements.filter(e => e.changes.length);
  if (!elements.length) throw new Error('No layout changes to put in a prompt.');
  const count = elements.reduce((n, e) => n + e.changes.length, 0);
  const out = [
    `# Layout changes: ${input.route}, ${elements.length} element${elements.length === 1 ? '' : 's'}, ${count} change${count === 1 ? '' : 's'}`,
    `Make every change below on ${input.route}${input.pageSource ? ` (${input.pageSource})` : ''}, in the code, with the project's own styles and tokens.`,
    `They were planned in a ${input.viewport.width}px wide window: keep the layout working at other widths.`,
    'Sizes "as rendered" (width, height and their min and max) are the size on screen, border and padding included.'
  ];
  if (input.note?.trim()) out.push('', `Note: ${quote(input.note)}`);
  elements.forEach((e, i) => {
    out.push('', `## ${i + 1}. ${e.element}${e.components?.length ? ` · ${e.components[e.components.length - 1]}` : ''}${e.source ? `  (${sourceText(e.source)})` : ''}`);
    out.push(`selector: ${e.selector}`);
    if (e.text) out.push(`text: ${quote(short(e.text))}`);
    if (e.components?.length) out.push(`components: ${e.components.join(' > ')}`);
    for (const c of e.changes) out.push(`- ${layoutChangeText(c)}`);
  });
  out.push(
    '',
    '## When done',
    `Report every element number (1 to ${elements.length}) as done, skipped or blocked, and name the route to open to verify it.`
  );
  return `${out.join('\n')}\n`;
}
