/**
 * The new-page prompt (Layout mode step 3, added 13 Nov 2026): a page sketched as rows of blocks,
 * as numbered parts top to bottom, ready to paste to an agent. Pure.
 */
import { INSERT_HINT } from './layoutPrompt.js';
import { wireframeLines } from './parts.js';
import type { Wireframe } from './schema.js';

export interface WireframePromptInput {
  wireframe: Wireframe;
  /** The route it was sketched on, when that helps ("next to /pricing"). */
  sketchedOn?: string;
  note?: string;
}

const quote = (text: string) => `"${text.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s*\n\s*/g, ' / ')}"`;

export function formatWireframePrompt(input: WireframePromptInput): string {
  const w = input.wireframe;
  const parts = w.rows.length;
  const out = [
    `# New page: ${w.route}, ${parts} part${parts === 1 ? '' : 's'}`,
    `Create the page ${w.route} in this project and add it to the app's routing, with the project's own components, styles and tokens.`,
    `It was sketched in a ${w.viewport.width}px wide window${input.sketchedOn ? `, over ${input.sketchedOn}` : ''}: keep it working at other widths. Heights are rough: let the content decide.`
  ];
  if (w.rows.some(r => r.blocks.some(b => b.what))) out.push(INSERT_HINT);
  if (input.note?.trim()) out.push('', `Note: ${quote(input.note)}`);
  out.push('', '## The page, top to bottom', ...wireframeLines(w));
  out.push(
    '',
    '## When done',
    `Report every part (1 to ${parts}) as done, skipped or blocked, and name the route to open to verify it.`
  );
  return `${out.join('\n')}\n`;
}
