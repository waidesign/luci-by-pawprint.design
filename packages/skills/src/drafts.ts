/**
 * AI-drafted luci.json fields that wait for a person's review (S10). Drafted fields
 * are listed in the contract's "drafts" array; ranking and rankability levels ignore
 * them until they are approved.
 */
import type { SkillContract } from '@luci-dev/format';
import { readSkillFolder, writeSkillFolder } from './lss.js';
import { MAX_KEYWORDS, MAX_KEYWORD_LENGTH } from './rankability.js';

export const DRAFTABLE_FIELDS = ['whenToUse', 'whenNotToUse', 'keywords'] as const;
export type DraftableField = (typeof DRAFTABLE_FIELDS)[number];

const isEmpty = (v: unknown) => v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const clean = (list: unknown) => [...new Set((Array.isArray(list) ? list : []).map(s => String(s).replace(/\s+/g, ' ').trim()).filter(Boolean))];

/**
 * Add drafted fields to a skill. Only fills empty fields (never author or derived ones),
 * enforces the anti-gaming caps, and records the field names in "drafts".
 */
export function addDrafts(dir: string, draft: Partial<Record<DraftableField, string[]>>): DraftableField[] {
  const skill = readSkillFolder(dir);
  const contract = skill.contract;
  const drafted: DraftableField[] = [];
  for (const field of DRAFTABLE_FIELDS) {
    if (!draft[field] || !isEmpty(contract[field])) continue;
    let value = clean(draft[field]);
    value = field === 'keywords'
      ? value.filter(k => k.length <= MAX_KEYWORD_LENGTH).slice(0, MAX_KEYWORDS)
      : value.filter(v => v.length <= 240).slice(0, 6);
    if (!value.length) continue;
    contract[field] = value;
    drafted.push(field);
  }
  if (drafted.length) {
    contract.drafts = [...new Set([...(contract.drafts ?? []), ...drafted])].sort();
    writeSkillFolder(dir, skill);
  }
  return drafted;
}

/** The drafted fields of a skill and their values. */
export function listDrafts(contract: SkillContract | undefined): Record<string, unknown> {
  return Object.fromEntries((contract?.drafts ?? []).filter(f => contract?.[f] !== undefined).map(f => [f, contract?.[f]]));
}

function settle(dir: string, fields: readonly string[] | null, approve: boolean): string[] {
  const skill = readSkillFolder(dir);
  const drafts = skill.contract.drafts ?? [];
  const chosen = fields ? drafts.filter(f => fields.includes(f)) : drafts;
  if (!chosen.length) return [];
  if (!approve) for (const f of chosen) delete (skill.contract as Record<string, unknown>)[f];
  const rest = drafts.filter(f => !chosen.includes(f));
  if (rest.length) skill.contract.drafts = rest;
  else delete skill.contract.drafts;
  writeSkillFolder(dir, skill);
  return chosen;
}

/** Approve drafts (all, or the given fields): they become regular fields that count for ranking. */
export const approveDrafts = (dir: string, fields: readonly string[] | null = null) => settle(dir, fields, true);
/** Reject drafts (all, or the given fields): the drafted values are deleted. */
export const rejectDrafts = (dir: string, fields: readonly string[] | null = null) => settle(dir, fields, false);
