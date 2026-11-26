import { z } from 'zod';
import { LAYOUT_VERSION } from './layout.js';
import { fail, ok, parseJsonText, type ParseResult } from '../result.js';

const command = z.string().min(1).nullable();

export const commandsSchema = z.object({
  dev: command,
  build: command,
  test: command,
  lint: command,
  typecheck: command
});

export const brainJsonSchema = z.looseObject({
  layout: z.literal(LAYOUT_VERSION),
  generatedBy: z.string().min(1),
  project: z.object({
    name: z.string().min(1),
    framework: z.string().min(1),
    languages: z.array(z.string()),
    packageManager: z.string().min(1),
    hasUi: z.boolean(),
    uiLibraries: z.array(z.string()),
    testing: z.array(z.string()),
    commands: commandsSchema,
    /** A monorepo's packages, each with its kind and stack (added 14 Nov 2026; absent for one project). */
    packages: z.array(z.object({ name: z.string().min(1), path: z.string().min(1), kind: z.string().min(1), framework: z.string().min(1) })).optional()
  }),
  precedence: z.array(z.string().min(1)).min(1),
  files: z.record(z.string(), z.string())
});

export type BrainJson = z.infer<typeof brainJsonSchema>;
export type ProjectCommands = z.infer<typeof commandsSchema>;

/** Parse .luci/brain.json. Keys someone added at the top level are kept. */
export function parseBrainJson(text: string): ParseResult<BrainJson> {
  const json = parseJsonText(text);
  if (!json.ok) return fail(`brain.json is ${json.error}`);
  const result = brainJsonSchema.safeParse(json.value);
  if (!result.success) return fail(`brain.json does not match layout ${LAYOUT_VERSION}:\n${z.prettifyError(result.error)}`);
  return ok(result.data);
}

/** The file text for brain.json: validated, known keys first, two-space indent, trailing newline. */
export function formatBrainJson(value: BrainJson): string {
  return `${JSON.stringify(brainJsonSchema.parse(value), null, 2)}\n`;
}
