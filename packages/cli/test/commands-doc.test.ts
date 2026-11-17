/**
 * docs/COMMANDS.md lists everything a person can run or press in Luci (user request, 2026-11-17). This
 * keeps it complete: a new terminal command, option, toolbar key or agent tool that is not in the
 * reference fails here, so the page on GitHub never falls behind the code.
 */
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { COMMANDS, run } from '../src/index.js';
import { TOOLS } from '../../mcp/src/index.js';
import { KEYS as CAPTURE_KEYS } from '../../capture/src/ui/toolbar.js';
import { FEEDBACK_KEYS } from '../../feedback/src/ui/feedback.js';
import { LAYOUT_KEYS } from '../../feedback/src/ui/layout.js';
import { fakeContext, tempProject } from './helpers.js';

const DOC = fs.readFileSync(fileURLToPath(new URL('../../../docs/COMMANDS.md', import.meta.url)), 'utf8');
/** The commands written in the reference: every `luci …` in backticks. */
const written = [...DOC.matchAll(/`(luci [^`]+)`/g)].map(m => m[1]!.replace(/\\\|/g, '|'));
const section = (heading: string) => {
  const start = DOC.indexOf(heading);
  expect(start, heading).toBeGreaterThanOrEqual(0);
  // Up to the next heading of the same level or higher (### Feedback stops at ### Layout; ## at ##)
  const level = /^#+/.exec(heading)![0];
  const next = DOC.slice(start + heading.length).search(new RegExp(`\\n#{1,${level.length}} `));
  return DOC.slice(start, next === -1 ? undefined : start + heading.length + next);
};

async function help(): Promise<string> {
  const f = fakeContext(tempProject());
  await run(['help'], f.ctx);
  return f.text();
}

describe('docs/COMMANDS.md', () => {
  it('lists every terminal command and its other names', () => {
    for (const name of Object.keys(COMMANDS).filter(n => !n.startsWith('-'))) {
      expect(written.some(c => c === `luci ${name}` || c.startsWith(`luci ${name} `)), `luci ${name}`).toBe(true);
    }
  });

  it('lists every subcommand and option that luci help shows', async () => {
    const text = await help();
    const subs: string[] = [];
    for (const line of text.split('\n')) {
      // "  skills search <query>", "  skills pin|unpin|block|unblock <name...>", "  packs add <name...>"
      const m = /^\s{2}(skills|packs) ([a-z|]+)/.exec(line);
      if (m) for (const sub of m[2]!.split('|')) subs.push(`${m[1]} ${sub}`);
    }
    // "capture [checks | rule <file> | baseline … | compare <a> <b> | crawl <urls...> … | layout <file>]"
    const capture = /^\s{2}capture \[(.+)\]$/m.exec(text)?.[1] ?? '';
    for (const m of capture.matchAll(/(?:^|\| )([a-z]+)/g)) subs.push(`capture ${m[1]}`);
    expect(subs.length).toBeGreaterThan(20);
    for (const sub of subs) {
      const [cmd, word] = sub.split(' ') as [string, string];
      expect(written.some(c => new RegExp(`^luci ${cmd}\\b.*\\b${word}\\b`).test(c)), `luci ${sub}`).toBe(true);
    }
    for (const flag of new Set(text.match(/(?<![\w-])--[a-z][a-z0-9-]*/g) ?? [])) {
      expect(new RegExp(`\`[^\`]*(?<![\\w-])${flag}(?![\\w-])[^\`]*\``).test(DOC), flag).toBe(true);
    }
  });

  it("lists every toolbar key, in its mode's section", () => {
    const modes = [
      ['### Feedback', FEEDBACK_KEYS],
      ['### Layout', LAYOUT_KEYS],
      ['### Capture', CAPTURE_KEYS]
    ] as const;
    for (const [heading, keys] of modes) {
      const text = section(heading);
      for (const [action, key] of Object.entries(keys)) expect(text, `${heading} ${action}`).toContain(`| \`${key}\` |`);
    }
    // The extension has Capture's keys
    const extension = section('## Chrome extension');
    for (const key of Object.values(CAPTURE_KEYS)) expect(extension, `extension ${key}`).toContain(`\`${key}\``);
  });

  it('lists every agent tool of luci-mcp', () => {
    const text = section('## Agent tools');
    for (const tool of TOOLS) expect(text, tool.name).toContain(`| \`${tool.name}\` |`);
  });
});
