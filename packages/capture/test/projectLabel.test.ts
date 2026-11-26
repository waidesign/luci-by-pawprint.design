import { describe, expect, it } from 'vitest';
import { projectLabel } from '../src/ui/projectLabel.js';

describe('projectLabel: the settings card never shows the full path (privacy, 2026-11-26)', () => {
  it('shows the folder name and luci serve\'s address', () => {
    expect(projectLabel({ project: '/home/dev/projects/shop', name: 'shop', url: 'http://127.0.0.1:4545' })).toBe('shop · 127.0.0.1:4545');
  });

  it('takes the last folder of a Windows path when no name is given', () => {
    const label = projectLabel({ project: 'C:\\Users\\someone\\code\\shop\\', url: 'http://localhost:4546' });
    expect(label).toBe('shop · localhost:4546');
    expect(label).not.toContain('someone');
  });

  it('works without an address', () => {
    expect(projectLabel({ project: '/srv/app' })).toBe('app');
    expect(projectLabel({})).toBe('project');
  });
});
