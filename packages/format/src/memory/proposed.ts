/**
 * A proposed memory item in .luci/memory/proposed/YYYY-MM-DD-topic.md. Agents write
 * these instead of editing rules.md, context.md or playbook.md; a person accepts or deletes them.
 *
 *   # <topic>
 *
 *   - What happened: <the situation that taught this>
 *   - Proposed: <the rule, convention or note to keep>
 *     (further lines indented)
 *   - Belongs in: rules.md | context.md | playbook.md | decisions/
 */
import { z } from 'zod';
import { fail, normalizeText, ok, type ParseResult } from '../result.js';

export const PROPOSAL_TARGETS = ['rules.md', 'context.md', 'playbook.md', 'decisions/'] as const;

export const proposalSchema = z.object({
  topic: z.string().trim().min(1),
  whatHappened: z.string().trim().min(1),
  proposed: z.string().trim().min(1),
  belongsIn: z.enum(PROPOSAL_TARGETS)
});

export type Proposal = z.infer<typeof proposalSchema>;

const FIELDS = { 'What happened': 'whatHappened', Proposed: 'proposed', 'Belongs in': 'belongsIn' } as const;
type FieldKey = (typeof FIELDS)[keyof typeof FIELDS];
const FIELD_RE = /^- (What happened|Proposed|Belongs in):(.*)$/;

export function parseProposal(text: string): ParseResult<Proposal> {
  const lines = normalizeText(text).split('\n');
  const topic = lines.find(l => l.startsWith('# '))?.slice(2).trim();
  if (!topic) return fail('proposal has no "# <topic>" line');

  const values: Partial<Record<FieldKey, string>> = {};
  let current: FieldKey | null = null;
  for (const line of lines) {
    const m = FIELD_RE.exec(line);
    if (m) {
      current = FIELDS[m[1] as keyof typeof FIELDS];
      values[current] = (m[2] ?? '').replace(/^ /, '');
    } else if (current && (line === '' || /^\s/.test(line))) {
      // Indented lines continue the field above; a blank line is kept inside it
      values[current] += `\n${line}`;
    } else {
      current = null;
    }
  }
  for (const key of Object.keys(values) as FieldKey[]) values[key] = values[key]?.replace(/\s+$/, '');

  const result = proposalSchema.safeParse({ topic, ...values });
  if (!result.success) return fail(`proposal "${topic}" is incomplete:\n${z.prettifyError(result.error)}`);
  return ok(result.data);
}

const field = (name: string, value: string) => `- ${name}:${value === '' || value.startsWith('\n') ? '' : ' '}${value}`;

export function formatProposal(proposal: Proposal): string {
  const p = proposalSchema.parse(proposal);
  return [
    `# ${p.topic}`,
    '',
    field('What happened', p.whatHappened),
    field('Proposed', p.proposed),
    field('Belongs in', p.belongsIn),
    ''
  ].join('\n');
}
