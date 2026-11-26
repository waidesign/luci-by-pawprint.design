import { expect, it } from 'vitest';
import { appendToSection, refreshSections, sectionBody, setSection } from '@luci-dev/format';

// Ported from the prototype: onboarding.test.js
it('setSection / appendToSection - edit one section, keep the rest', () => {
  const doc = '# Title\n\n## A\nold\n\n## B\nkeep\n';
  expect(setSection(doc, '## A', 'new')).toBe('# Title\n\n## A\nnew\n\n## B\nkeep\n');
  expect(setSection(doc, '## C', 'added').endsWith('## C\nadded\n')).toBe(true);
  expect(appendToSection(doc, '## A', ['- x'])).toBe('# Title\n\n## A\nold\n- x\n\n## B\nkeep\n');
  expect(appendToSection(doc, '## Z', ['- y']).endsWith('## Z\n- y\n')).toBe(true);
});

it('sectionBody reads one section and ignores Windows line endings', () => {
  expect(sectionBody('# T\r\n\r\n## A\r\none\r\ntwo\r\n\r\n## B\r\nx\r\n', '## A')).toBe('one\ntwo');
  expect(sectionBody('# T\n', '## Missing')).toBe('');
});

it('refreshSections rewrites only exact headings and reports what changed', () => {
  const doc = '# T\n\n## Stack (auto-detected)\nold\n\n## Commands (confirmed)\nmine\n';
  const { content, changed } = refreshSections(doc, {
    '## Stack (auto-detected)': 'new',
    '## Commands (auto-detected)': 'ignored'
  });
  expect(changed).toEqual(['## Stack (auto-detected)']);
  expect(content).toBe('# T\n\n## Stack (auto-detected)\nnew\n\n## Commands (confirmed)\nmine\n');
  expect(refreshSections(content, { '## Stack (auto-detected)': 'new' }).changed).toEqual([]);
});
