import type { LockEntry, SkillContract } from '@luci-dev/format';

/** Which library a skill was loaded from. */
export type LibraryKind = 'official' | 'personal' | 'project';

/** A skill as the registry knows it. `content` (the SKILL.md body) is read lazily. */
export interface Skill {
  id: string;
  name: string;
  category: string;
  description: string;
  author: string;
  license: string;
  version: string;
  tags: string[];
  keywords: string[];
  frameworks: string[];
  dependencies: string[];
  relatedSkills: string[];
  lastVerified: string | null;
  summary: string;
  contract: SkillContract;
  format: 'lss' | 'legacy';
  /** Path of SKILL.md (or the legacy .md) relative to the library folder. */
  path: string;
  tokenEstimate?: number;
  library?: LibraryKind;
  filePath?: string;
  dir?: string;
  /** Set on a personal skill that replaces an official one with the same name. */
  overrides?: string;
  /** Set on library skills a project selected (from its lockfile). */
  selection?: LockEntry;
  readonly content: string;
}

/** Anything the selection engine can read skills from: a registry or a project's skill set. */
export interface SkillSource {
  getAllSkills(): Promise<Skill[]>;
  getSkill(id: string): Promise<Skill | null>;
  preferences?: { pinned: string[]; blocked: string[] };
}

export const estimateTokens = (text: string | undefined | null) => Math.round((text ?? '').length / 4);
