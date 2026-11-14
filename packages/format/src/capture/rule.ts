/**
 * Capture to rule (v0.3.2): a component capture saved in the project becomes a proposed project rule,
 * one line for rules.md that points at the design file and names its key values (what the agent sees
 * every session; the file holds the rest). Luci never edits rules.md: the rule is a proposal in
 * .luci/memory/proposed/ that the person accepts by moving it, or deletes. Pure and browser-safe, so
 * the toolbar can show the rule before it is written.
 */
import type { Proposal } from '../memory/proposed.js';
import type { ComponentSpec, SpecPart, SpecStyle } from './read.js';

/** The container's properties a rule names, in this order (when the design sets them). */
const BOX_KEYS = ['background-color', 'color', 'border', 'border-radius', 'padding', 'gap', 'box-shadow'] as const;
/** A text part's properties a rule names. */
const TEXT_KEYS = ['font-family', 'font-size', 'font-weight', 'line-height', 'color', 'text-transform'] as const;
/** At most this many changes per state. */
const STATE_CHANGES = 2;

const valueText = (s: SpecStyle) => `${s.property} ${s.value}${s.token ? ` (${s.token})` : ''}`;
const pick = (part: SpecPart | undefined, keys: readonly string[]) =>
  part ? keys.flatMap(k => part.styles.filter(s => s.property === k)).map(valueText) : [];

/** "primary-button" -> "primary button": what the rule is about, in words. */
export const ruleSubject = (spec: Pick<ComponentSpec, 'meta'>) => spec.meta.name.replace(/-\d+$/, '').replace(/-/g, ' ');

/** The rule's one line: build every <kind> like the file, with its key values and state changes. */
export function ruleText(spec: ComponentSpec, file: string): string {
  const container = spec.parts[0];
  const text = spec.parts.find(p => p.part !== 'container' && p.styles.some(s => TEXT_KEYS.includes(s.property as (typeof TEXT_KEYS)[number])));
  const groups = [
    pick(container, BOX_KEYS).join(', '),
    text ? `${text.part} ${pick(text, TEXT_KEYS).join(', ')}` : ''
  ];
  const states = spec.states
    .filter(s => s.status === 'changes' && s.changes.length)
    .map(s => `on ${s.state} ${s.changes.slice(0, STATE_CHANGES).map(c => `${c.part === 'container' ? '' : `${c.part} `}${c.property} ${c.to}${c.token ? ` (${c.token})` : ''}`).join(', ')}`);
  const values = [...groups, ...states].filter(Boolean).join('; ');
  const instructions = spec.instructions ? ' Follow the person\'s instructions at the top of the file.' : '';
  return `Build every ${ruleSubject(spec)} like \`${file}\` (read it first: parts, states, motion, accessibility)${values ? `: ${values}` : ''}.${instructions}`;
}

/**
 * A proposed rule from a component capture saved in the project. `file` is its path in the project
 * (".luci/design/example-com.component.primary-button.design.md").
 */
export function ruleFromComponent(spec: ComponentSpec, file: string): Proposal {
  const subject = ruleSubject(spec);
  return {
    topic: `Build every ${subject} like its design file`,
    whatHappened: `The person made the design capture of ${spec.meta.name} (${spec.meta.type}, from ${spec.meta.source}, captured ${spec.meta.captured}) a rule with Luci.`,
    proposed: ruleText(spec, file),
    belongsIn: 'rules.md'
  };
}
