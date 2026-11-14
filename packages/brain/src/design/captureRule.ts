/**
 * Capture to rule (v0.3.2): a component capture saved in .luci/design/ becomes a proposed rule in
 * .luci/memory/proposed/, for the person to accept (move the line into rules.md) or delete. Luci
 * never edits rules.md. The same rule proposed again finds the one already waiting.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MEMORY_FILES, PRODUCT, formatProposal, type Proposal } from '@luci/format';
import { readComponentFile, ruleFromComponent } from '@luci/format/capture';
import { memoryDir, memoryPath } from '../layout/brainLayout.js';
import { DesignError, DesignStore } from './designStore.js';

export interface CaptureRule {
  /** The proposal's path in the project (".luci/memory/proposed/2026-11-14-....md"). */
  path: string;
  proposal: Proposal;
  /** The proposal file's text. */
  text: string;
  /** True when the same proposal was already waiting (nothing new was written). */
  existed: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);
const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'rule';

/** The rule for one saved component capture, without writing anything. */
export function captureRule(projectDir: string, fileName: string): { proposal: Proposal; text: string } {
  const store = new DesignStore(projectDir);
  if (!store.available) throw new DesignError(`No ${PRODUCT.projectDir}/ in ${projectDir}. Run \`${PRODUCT.command} init\` there first.`);
  const markdown = store.read(fileName);
  if (markdown === null) throw new DesignError(`No design file ${fileName} in ${PRODUCT.projectDir}/${MEMORY_FILES.design}/. Save the capture into the project first (the dev toolbar's "Save to project").`);
  const spec = readComponentFile(markdown);
  if (!spec.ok) throw new DesignError(spec.error.replace('A design check needs', 'A rule needs'));
  const proposal = ruleFromComponent(spec.value, memoryPath(`${MEMORY_FILES.design}/${fileName}`));
  return { proposal, text: formatProposal(proposal) };
}

/** Write the rule for a saved component capture as a proposal (or find the same one waiting). */
export function proposeCaptureRule(projectDir: string, fileName: string): CaptureRule {
  const { proposal, text } = captureRule(projectDir, fileName);
  const dir = path.join(memoryDir(projectDir), MEMORY_FILES.proposedMemory);
  const existing = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')) : [];
  const same = existing.find(f => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n') === text);
  if (same) return { path: memoryPath(`${MEMORY_FILES.proposedMemory}/${same}`), proposal, text, existed: true };
  fs.mkdirSync(dir, { recursive: true });
  const base = `${today()}-${slug(proposal.topic)}`;
  let name = `${base}.md`;
  for (let n = 2; existing.includes(name); n++) name = `${base}-${n}.md`;
  fs.writeFileSync(path.join(dir, name), text, 'utf8');
  return { path: memoryPath(`${MEMORY_FILES.proposedMemory}/${name}`), proposal, text, existed: false };
}
