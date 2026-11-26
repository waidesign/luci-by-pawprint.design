import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HELP_PATH = fileURLToPath(new URL('../entrypoints/help.html', import.meta.url));

describe('help.html (B-43)', () => {
  it('requires Node.js 22+, documents Team Feedback & Reviewer, and standardizes spelling', () => {
    const content = fs.readFileSync(HELP_PATH, 'utf8');
    expect(content).toContain('Node.js 22');
    expect(content).not.toContain('Node.js 18');
    expect(content).toContain('Team Feedback');
    expect(content).toContain('Reviewer mode');
    expect(content).toContain('Tailwind');
    expect(content).not.toMatch(/\bcolour\b/i);
  });
});
