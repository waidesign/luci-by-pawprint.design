import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  BRAIN_JSON_FILES,
  LOCAL_GITIGNORE,
  PRECEDENCE,
  decisionFileName,
  formatBrainJson,
  formatDecision,
  formatProposal,
  parseActiveTaskHeader,
  parseBrainJson,
  parseDecision,
  parseProposal,
  type ParseResult
} from '@luci/format';

const fixtures = fileURLToPath(new URL('../fixtures/', import.meta.url));
const memory = path.join(fixtures, 'memory-layout', '.luci');
const read = (...parts: string[]) => fs.readFileSync(path.join(...parts), 'utf8').replace(/\r\n/g, '\n');

function value<T>(result: ParseResult<T>): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}
function error<T>(result: ParseResult<T>): string {
  if (result.ok) throw new Error('expected a parse error');
  return result.error;
}

describe('brain.json', () => {
  const text = read(memory, 'brain.json');

  it('the hand-written target parses and round-trips byte for byte', () => {
    expect(formatBrainJson(value(parseBrainJson(text)))).toBe(text);
  });

  it('matches the precedence and file map Luci writes', () => {
    const brain = value(parseBrainJson(text));
    expect(brain.precedence).toEqual(PRECEDENCE);
    expect(brain.files).toEqual(BRAIN_JSON_FILES);
  });

  it('keeps top-level keys someone added', () => {
    expect(value(parseBrainJson(text))['owner']).toBe('Kept because someone added it');
  });

  it('tolerates a byte-order mark', () => {
    expect(value(parseBrainJson(`﻿${text}`)).project.name).toBe('sample-app');
  });

  it('explains what is wrong', () => {
    expect(error(parseBrainJson('{ nope'))).toMatch(/not valid JSON/);
    const json = JSON.parse(text) as Record<string, unknown>;
    expect(error(parseBrainJson(JSON.stringify({ ...json, layout: 2 })))).toMatch(/layout/);
    const project = { ...(json['project'] as object), name: '' };
    expect(error(parseBrainJson(JSON.stringify({ ...json, project })))).toMatch(/project\.name/);
  });
});

describe('decision records', () => {
  const dir = path.join(memory, 'decisions');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));

  it.each(files)('%s parses, round-trips and is named from its title', (file) => {
    const text = read(dir, file);
    const decision = value(parseDecision(text));
    expect(formatDecision(decision)).toBe(text);
    expect(decisionFileName(decision)).toBe(file);
  });

  it('"_Not recorded._" reads as empty and is written back', () => {
    const decision = value(parseDecision(read(dir, '2026-11-10-keep-the-old-api.md')));
    expect(decision.why).toBe('');
    expect(decision.status).toBe('replaced by 2026-11-12-use-pnpm-workspaces.md');
    expect(decision.area).toBeUndefined();
  });

  it('reads Windows line endings', () => {
    const text = read(dir, '2026-11-12-use-pnpm-workspaces.md');
    expect(value(parseDecision(text.replace(/\n/g, '\r\n')))).toEqual(value(parseDecision(text)));
  });

  it('rejects a missing title, a bad date and an unknown status', () => {
    expect(error(parseDecision('- Date: 2026-11-12\n'))).toMatch(/title/);
    expect(error(parseDecision('# X\n\n- Date: 12 Nov\n- Status: accepted\n\n## What\nX\n'))).toMatch(/date/i);
    expect(error(parseDecision('# X\n\n- Date: 2026-11-12\n- Status: maybe\n\n## What\nX\n'))).toMatch(/Status must be/);
  });
});

describe('proposed memory', () => {
  const dir = path.join(memory, 'memory', 'proposed');
  const text = read(dir, '2026-11-12-run-the-benchmark.md');

  it('parses, keeps indented lines and round-trips', () => {
    const proposal = value(parseProposal(text));
    expect(proposal.belongsIn).toBe('rules.md');
    expect(proposal.proposed.split('\n')).toHaveLength(3);
    expect(formatProposal(proposal)).toBe(text);
  });

  it('rejects an unknown destination', () => {
    expect(error(parseProposal(text.replace('rules.md', 'README.md')))).toMatch(/belongsIn/);
  });
});

describe('active task header', () => {
  const text = read(fixtures, 'active-task.md');

  it('reads task, status and start date', () => {
    expect(value(parseActiveTaskHeader(text))).toEqual({ task: 'Add a pricing page', status: 'active', started: '2026-11-12' });
  });

  it('only the first word of Status counts; no Status means active', () => {
    expect(value(parseActiveTaskHeader(text.replace('active', 'done (2026-11-13)'))).status).toBe('done');
    expect(value(parseActiveTaskHeader('- **Task**: X\n')).status).toBe('active');
  });

  it('rejects an unknown status', () => {
    expect(error(parseActiveTaskHeader(text.replace('active', 'paused')))).toMatch(/status/);
  });
});

it('local/.gitignore matches what Luci writes', () => {
  expect(read(memory, 'local', '.gitignore')).toBe(LOCAL_GITIGNORE);
});
