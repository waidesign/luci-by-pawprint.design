import { describe, expect, it } from 'vitest';
import {
  formatSkillLock,
  parseFrontmatter,
  parseSkillContract,
  parseSkillLock,
  packSchema,
  stringifyFrontmatter
} from '@luci-dev/format';

// Ported from the prototype: frontmatter.test.js
describe('frontmatter', () => {
  it('plain, quoted and inline list values', () => {
    const { data, content } = parseFrontmatter('---\nname: pdf\ndescription: "Say \\"hi\\""\nlicense: \'Apache 2.0\'\ntags: [a, "b c"]\n---\n\n# Body\n');
    expect(data['name']).toBe('pdf');
    expect(data['description']).toBe('Say "hi"');
    expect(data['license']).toBe('Apache 2.0');
    expect(data['tags']).toEqual(['a', 'b c']);
    expect(content).toBe('# Body');
  });

  it('folded and literal multi-line text', () => {
    const folded = parseFrontmatter('---\ndescription: >\n  Generate images\n  from text.\n\n  Second paragraph.\nname: x\n---\nbody');
    expect(folded.data['description']).toBe('Generate images from text.\nSecond paragraph.');
    expect(folded.data['name']).toBe('x');
    expect(parseFrontmatter('---\ndescription: |-\n  line one\n  line two\n---\nbody').data['description']).toBe('line one\nline two');
  });

  it('nested metadata map and dash lists', () => {
    const { data } = parseFrontmatter('---\nname: x\nmetadata:\n  luci-category: "ui-ux"\n  version: 1.0\nitems:\n  - one\n  - "two"\n---\n');
    expect(data['metadata']).toEqual({ 'luci-category': 'ui-ux', version: '1.0' });
    expect(data['items']).toEqual(['one', 'two']);
  });

  it('CRLF, BOM, and files without frontmatter', () => {
    expect(parseFrontmatter('﻿---\r\nname: x\r\n---\r\nbody').data['name']).toBe('x');
    const none = parseFrontmatter('# Just markdown');
    expect(none.hasFrontmatter).toBe(false);
    expect(none.content).toBe('# Just markdown');
  });

  it('stringify round-trips', () => {
    const data = {
      name: 'pricing-page',
      description: 'Pricing "pages": plans & toggles',
      license: 'MIT',
      metadata: { 'luci-title': 'Pricing Page', 'luci-tags': 'pricing, plans' }
    };
    const parsed = parseFrontmatter(stringifyFrontmatter(data, '# Body\n\nText'));
    expect(parsed.data).toEqual(data);
    expect(parsed.content).toBe('# Body\n\nText');
  });
});

describe('luci.json, skills.lock.json and packs', () => {
  it('a contract keeps unknown fields for the linter', () => {
    const r = parseSkillContract('{"lss":1,"keywords":["a"],"mystery":true}');
    expect(r.ok && r.value['mystery']).toBe(true);
    expect(parseSkillContract('[1]').ok).toBe(false);
  });

  it('the lockfile round-trips sorted and rejects other versions', () => {
    const text = formatSkillLock({ lss: 1, skills: [{ id: 'tdd', reason: 'x' }, { id: 'baseline-ui', packs: ['ui'] }] });
    const lock = parseSkillLock(text);
    expect(lock.ok && lock.value.skills.map(s => s.id)).toEqual(['baseline-ui', 'tdd']);
    expect(parseSkillLock('{"gss":1,"skills":[]}').ok).toBe(false);
  });

  it('a pack needs a valid name and signals', () => {
    expect(packSchema.safeParse({ name: 'ui', title: 'UI', description: 'd', signals: { always: true }, skills: ['x'] }).success).toBe(true);
    expect(packSchema.safeParse({ name: 'Bad Name', title: 'UI', description: 'd', signals: {} }).success).toBe(false);
  });
});
