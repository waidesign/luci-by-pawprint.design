/**
 * New parts in prompts (Layout mode steps 2 and 3): what a part is, its planned size, and a sketched
 * page as numbered lines. Pure.
 */
import type { Part, Wireframe } from './schema.js';

const quote = (text: string) => `"${text.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s*\n\s*/g, ' / ')}"`;

/**
 * "another `PlanCard` (src/components/PlanCard.jsx; one is at `main > section > div`)", "a new card
 * grid". On a new page a component is "the `Nav` component" (there is no other one there).
 */
export function partText(what: Part, onNewPage = false): string {
  if (what.kind === 'component') {
    const where = [what.file, what.example ? `one is at \`${what.example.selector}\`` : ''].filter(Boolean).join('; ');
    const name = onNewPage ? `the \`${what.name}\` component` : `${what.example ? 'another' : 'a'} \`${what.name}\``;
    return `${name}${where ? ` (${where})` : ''}`;
  }
  if (what.kind === 'capture') return `a part like the saved capture ${quote(what.name)}${what.file ? ` (${what.file})` : ''}`;
  return `a new ${what.name}`;
}

/** "280px wide, 400px tall", "full width, 200px tall", "" when no size was set. */
export function sizeText(width?: string, height?: string): string {
  const w = width === '100%' ? 'full width' : width ? `${width} wide` : '';
  const h = height ? `${height} tall` : '';
  return [w, h].filter(Boolean).join(', ');
}

/** A share of a row as a fraction: 6 of 12 -> "1/2", 4 of 12 -> "1/3", 12 of 12 -> "full width". */
export function shareText(span: number, total: number): string {
  if (span >= total) return 'full width';
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
  const d = gcd(span, total);
  return `${span / d}/${total / d} of the width`;
}

/** One block of a sketched page: "a new image slot: "Product screenshot"", or its label alone. */
function blockText(block: Wireframe['rows'][number]['blocks'][number]): string {
  const what = block.what ? partText(block.what, true) : 'an area';
  return `${what}${block.label ? `: ${quote(block.label)}` : ''}`;
}

/** The sketched page, top to bottom: one numbered line per row; a row of several blocks lists them as 2a, 2b... */
export function wireframeLines(w: Wireframe, indent = ''): string[] {
  const out: string[] = [];
  w.rows.forEach((row, i) => {
    const n = i + 1;
    const total = row.blocks.reduce((s, b) => s + b.span, 0);
    if (row.blocks.length === 1) {
      out.push(`${indent}${n}. Full width, about ${row.height} tall: ${blockText(row.blocks[0]!)}`);
      return;
    }
    out.push(`${indent}${n}. A row of ${row.blocks.length} side by side, about ${row.height} tall:`);
    row.blocks.forEach((b, j) => out.push(`${indent}   - ${n}${String.fromCharCode(97 + j)}. ${shareText(b.span, total)}: ${blockText(b)}`));
  });
  return out;
}
