/**
 * Trust levels: where a skill comes from and who has checked it. Shown wherever
 * Luci shows a skill, so people and agents know how far to trust its instructions.
 *
 *   official   in Luci's own library, reviewed by Luci's maintainers
 *   verified   in its author's repo, checked and approved (reserved: comes with Luci's verified list)
 *   community  from someone's GitHub repo, not reviewed
 *   personal   written or added locally by you
 *   project    in this project's .luci/skills/ folder
 */
import { PRODUCT } from '@luci-dev/format';
import type { Skill } from './types.js';

export type TrustLevel = 'official' | 'verified' | 'community' | 'personal' | 'project';

export const TRUST_LEVELS: Readonly<Record<TrustLevel, { label: string; note: string }>> = {
  official: { label: 'official', note: `reviewed by ${PRODUCT.name}` },
  verified: { label: 'verified', note: `checked by ${PRODUCT.name} at a pinned version` },
  community: { label: 'community', note: `from GitHub, not reviewed by ${PRODUCT.name}` },
  personal: { label: 'personal', note: `your own skill, not reviewed by ${PRODUCT.name}` },
  project: { label: 'project', note: "this project's own skill" }
};

/** A skill's trust level, from the library the registry loaded it from. */
export function trustLevel(skill: Pick<Skill, 'library' | 'contract'> | null | undefined): TrustLevel {
  if (!skill) return 'community';
  if (skill.library === 'project') return 'project';
  // A skill can never declare itself verified: that will come only from Luci's own
  // list of verified repos and versions, not from anything inside the skill.
  if (skill.library === 'personal') return skill.contract?.source?.repo ? 'community' : 'personal';
  return 'official';
}

/** True when a person should look before an agent follows the skill: not reviewed and able to run commands. */
export function needsCaution(skill: Pick<Skill, 'library' | 'contract'>): boolean {
  const level = trustLevel(skill);
  return (level === 'community' || level === 'personal') && (skill.contract?.permissions ?? []).includes('shell');
}

/** "community — from GitHub, not reviewed by Luci" */
export function describeTrust(skill: Pick<Skill, 'library' | 'contract'>): string {
  const t = TRUST_LEVELS[trustLevel(skill)];
  return `${t.label} — ${t.note}`;
}
