/**
 * Luci Skill Standard (LSS) v1: a skill is a folder with an Agent Skills SKILL.md
 * plus luci.json, the contract Luci reads for ranking, trust and licences.
 * See docs/format/skill-standard.md.
 */
import { z } from 'zod';
import { fail, ok, parseJsonText, type ParseResult } from '../result.js';

export const LSS_VERSION = 1;
export const SKILL_FILE = 'SKILL.md';
export const CONTRACT_FILE = 'luci.json';
export const LOCK_FILE = 'skills.lock.json';
export const CATALOG_FILE = 'project-skills.md';

/** Keys in SKILL.md `metadata` that Luci reads (Agent Skills allows any string map there). */
export const META = {
  title: 'luci-title',
  category: 'luci-category',
  author: 'luci-author',
  version: 'luci-version',
  tags: 'luci-tags'
} as const;

/** Frontmatter fields the Agent Skills format allows; anything else goes into luci.json. */
export const AGENT_SKILLS_FIELDS = ['name', 'description', 'license', 'compatibility', 'allowed-tools', 'metadata'] as const;

export const LICENSE_CATEGORIES = ['open', 'copyleft', 'restricted', 'unknown'] as const;
export type LicenseCategory = (typeof LICENSE_CATEGORIES)[number];

export const PERMISSIONS = ['shell', 'network', 'filesystem', 'secrets'] as const;

const strings = z.array(z.string());

export const skillSourceSchema = z.looseObject({
  repo: z.string().optional(),
  path: z.string().optional(),
  licenseVerified: z.boolean().optional(),
  licenseStatus: z.enum(LICENSE_CATEGORIES).optional(),
  licenseEvidence: z.string().optional(),
  licenseUrl: z.string().nullable().optional(),
  licenseCheckedAt: z.string().optional(),
  /** The copyright line the licence requires to be kept. */
  copyright: z.string().optional(),
  filesLeftAtSource: z.number().optional()
});

/** luci.json. Unknown fields are kept (the linter warns about them). */
export const skillContractSchema = z.looseObject({
  lss: z.number().optional(),
  summary: z.string().optional(),
  keywords: strings.optional(),
  whenToUse: strings.optional(),
  whenNotToUse: strings.optional(),
  inputs: strings.optional(),
  outputs: strings.optional(),
  constraints: strings.optional(),
  dependsOn: strings.optional(),
  related: strings.optional(),
  frameworks: strings.optional(),
  verification: strings.optional(),
  permissions: strings.optional(),
  lastVerified: z.string().optional(),
  verifiedAgainst: strings.optional(),
  packages: strings.optional(),
  exclusiveGroup: z.string().optional(),
  source: skillSourceSchema.optional(),
  extraFrontmatter: z.record(z.string(), z.unknown()).optional(),
  domains: strings.optional(),
  /** Fields Luci filled from the skill's own text (refreshable). */
  derived: strings.optional(),
  /** AI-drafted fields waiting for a person's review; ignored for ranking until approved. */
  drafts: strings.optional()
});

export type SkillSource = z.infer<typeof skillSourceSchema>;
export type SkillContract = z.infer<typeof skillContractSchema>;

/** The type each known contract field must have, for the linter's messages. */
export const CONTRACT_FIELD_TYPES: Readonly<Record<string, 'number' | 'string' | 'string[]' | 'object'>> = {
  lss: 'number', summary: 'string', keywords: 'string[]', whenToUse: 'string[]', whenNotToUse: 'string[]',
  inputs: 'string[]', outputs: 'string[]', constraints: 'string[]', dependsOn: 'string[]', related: 'string[]',
  frameworks: 'string[]', verification: 'string[]', permissions: 'string[]', lastVerified: 'string',
  verifiedAgainst: 'string[]', packages: 'string[]', exclusiveGroup: 'string', source: 'object',
  extraFrontmatter: 'object', domains: 'string[]', derived: 'string[]', drafts: 'string[]'
};

/** Parse luci.json leniently: invalid JSON is an error, odd field types are left for the linter. */
export function parseSkillContract(text: string): ParseResult<SkillContract> {
  const json = parseJsonText(text);
  if (!json.ok) return fail(`luci.json is ${json.error}`);
  if (!json.value || typeof json.value !== 'object' || Array.isArray(json.value)) return fail('luci.json must be a JSON object');
  return ok(json.value as SkillContract);
}

export function formatSkillContract(contract: SkillContract): string {
  return `${JSON.stringify(contract, null, 2)}\n`;
}

// ---------- skills.lock.json: the library skills a project uses ----------

export const lockEntrySchema = z.looseObject({
  id: z.string().min(1),
  version: z.string().optional(),
  reason: z.string().optional(),
  addedAt: z.string().optional(),
  /** Set for skills from the personal library, so teammates get a clear message. */
  library: z.string().optional(),
  from: z.string().optional(),
  /** Packs that added this skill; skills chosen by hand have none. */
  packs: strings.optional()
});

export const skillLockSchema = z.object({
  lss: z.literal(LSS_VERSION),
  skills: z.array(lockEntrySchema)
});

export type LockEntry = z.infer<typeof lockEntrySchema>;
export type SkillLock = z.infer<typeof skillLockSchema>;

export function parseSkillLock(text: string): ParseResult<SkillLock> {
  const json = parseJsonText(text);
  if (!json.ok) return fail(`${LOCK_FILE} is ${json.error}`);
  const result = skillLockSchema.safeParse(json.value);
  if (!result.success) return fail(`${LOCK_FILE} is not valid:\n${z.prettifyError(result.error)}`);
  return ok(result.data);
}

export function formatSkillLock(lock: SkillLock): string {
  const skills = [...lock.skills].sort((a, b) => a.id.localeCompare(b.id));
  return `${JSON.stringify({ lss: LSS_VERSION, skills }, null, 2)}\n`;
}

// ---------- Skill packs ----------

export const packSchema = z.object({
  name: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, '"name" must be lowercase letters, digits and hyphens'),
  title: z.string().min(1),
  description: z.string().min(1),
  requires: z.object({ hasUi: z.boolean().optional() }).optional(),
  signals: z.object({
    always: z.boolean().optional(),
    dependencies: strings.optional(),
    dependencyPrefixes: strings.optional(),
    files: strings.optional(),
    goalWords: strings.optional()
  }),
  skills: strings.optional(),
  when: z.array(z.object({ dependencies: strings.optional(), files: strings.optional(), skills: strings })).optional(),
  fromGroup: z.string().optional()
});

export type SkillPack = z.infer<typeof packSchema>;
