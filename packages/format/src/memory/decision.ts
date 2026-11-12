/**
 * A decision record in .luci/decisions/YYYY-MM-DD-short-title.md:
 *
 *   # <title>
 *
 *   - Date: YYYY-MM-DD
 *   - Status: proposed | accepted | replaced by <file>
 *   - Area: <category>            (optional)
 *
 *   ## What
 *   ## Why
 *   ## Alternatives considered
 */
import { z } from 'zod';
import { sectionBody } from '../markdown/sections.js';
import { fail, normalizeText, ok, type ParseResult } from '../result.js';

const NOT_RECORDED = '_Not recorded._';

export const decisionSchema = z.object({
  title: z.string().trim().min(1),
  date: z.iso.date(),
  status: z.string().regex(/^(proposed|accepted|replaced by \S.*)$/, 'Status must be proposed, accepted or "replaced by <file>"'),
  area: z.string().trim().min(1).optional(),
  what: z.string().trim().min(1),
  /** '' when not recorded. */
  why: z.string(),
  /** '' when not recorded. */
  alternatives: z.string()
});

export type Decision = z.infer<typeof decisionSchema>;

/** The file name for a decision: date plus a slug of the title. */
export function decisionFileName(decision: Pick<Decision, 'date' | 'title'>): string {
  const slug = decision.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'decision';
  return `${decision.date}-${slug}.md`;
}

function headerField(lines: readonly string[], name: string): string | undefined {
  const re = new RegExp(`^- ${name}:\\s*(.+)$`, 'i');
  for (const line of lines) {
    if (line.startsWith('## ')) break;
    const m = re.exec(line);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

const recorded = (text: string) => (text === NOT_RECORDED ? '' : text);

export function parseDecision(text: string): ParseResult<Decision> {
  const content = normalizeText(text);
  const lines = content.split('\n');
  const title = lines.find(l => l.startsWith('# '))?.slice(2).trim();
  if (!title) return fail('decision record has no "# <title>" line');

  const area = headerField(lines, 'Area');
  const result = decisionSchema.safeParse({
    title,
    date: headerField(lines, 'Date'),
    status: headerField(lines, 'Status'),
    ...(area ? { area } : {}),
    what: sectionBody(content, '## What'),
    why: recorded(sectionBody(content, '## Why')),
    alternatives: recorded(sectionBody(content, '## Alternatives considered'))
  });
  if (!result.success) return fail(`decision record "${title}" is incomplete:\n${z.prettifyError(result.error)}`);
  return ok(result.data);
}

export function formatDecision(decision: Decision): string {
  const d = decisionSchema.parse(decision);
  return [
    `# ${d.title}`,
    '',
    `- Date: ${d.date}`,
    `- Status: ${d.status}`,
    ...(d.area ? [`- Area: ${d.area}`] : []),
    '',
    '## What',
    d.what,
    '',
    '## Why',
    d.why || NOT_RECORDED,
    '',
    '## Alternatives considered',
    d.alternatives || NOT_RECORDED,
    ''
  ].join('\n');
}
