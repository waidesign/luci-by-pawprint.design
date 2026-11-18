import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { hideHomePaths, luciHomeLabel } from '../src/index.js';

// Synthetic folders in this platform's form, so the test reads the same on Windows and macOS
const root = path.parse(process.cwd()).root;
const homeDir = path.join(root, 'Users', 'sam');
const home = { dir: path.join(homeDir, '.luci'), label: '~/.luci' };
const slash = (p: string) => p.replace(/\\/g, '/');

describe('hideHomePaths', () => {
  it('writes a path under Luci\'s folder as ~/.luci/..., and any other home path as ~/..., with forward slashes', () => {
    const skill = path.join(home.dir, 'skills', 'general', 'voice', 'SKILL.md');
    const other = path.join(homeDir, 'AppData', 'npm', 'node_modules', '@luci-dev', 'skills', 'library', 'tdd', 'SKILL.md');
    expect(hideHomePaths(`Open ${skill} or ${other}.`, { home, homeDir })).toBe('Open ~/.luci/skills/general/voice/SKILL.md or ~/AppData/npm/node_modules/@luci-dev/skills/library/tdd/SKILL.md.');
    expect(hideHomePaths(`Global Brain: ${path.join(home.dir, 'brain')}, 10 files`, { home, homeDir })).toBe('Global Brain: ~/.luci/brain, 10 files');
    expect(hideHomePaths(`folder ${home.dir}`, { home, homeDir })).toBe('folder ~/.luci');
    // Either slash style, as tools and agents write them
    expect(hideHomePaths(slash(skill), { home, homeDir })).toBe('~/.luci/skills/general/voice/SKILL.md');
  });

  it('reads JSON text too, where backslashes are doubled', () => {
    const json = JSON.stringify({ path: path.join(home.dir, 'brain'), file: path.join(homeDir, 'x', 'y.md') });
    expect(JSON.parse(hideHomePaths(json, { home, homeDir }))).toEqual({ path: '~/.luci/brain', file: '~/x/y.md' });
  });

  it('keeps the project an agent works in as it is, even under the home folder', () => {
    const project = path.join(homeDir, 'code', 'shop');
    const text = `Project ${project}, file ${path.join(project, 'src', 'App.tsx')}, brain ${path.join(home.dir, 'brain')}`;
    expect(hideHomePaths(text, { home, homeDir, keep: [project] })).toBe(`Project ${project}, file ${path.join(project, 'src', 'App.tsx')}, brain ~/.luci/brain`);
    expect(JSON.parse(hideHomePaths(JSON.stringify({ project }), { home, homeDir, keep: [project] })).project).toBe(project);
  });

  it('never touches a folder that only starts with the same letters, or text without paths', () => {
    const neighbour = path.join(root, 'Users', 'samantha', 'notes.md');
    expect(hideHomePaths(neighbour, { home, homeDir })).toBe(neighbour);
    expect(hideHomePaths('Rules:\nKeep it short. ~/.luci stays.', { home, homeDir })).toBe('Rules:\nKeep it short. ~/.luci stays.');
  });

  it('labels Luci\'s folder $LUCI_HOME when that is set', () => {
    // test-setup.ts sets LUCI_HOME for every test file
    expect(luciHomeLabel().label).toBe('$LUCI_HOME');
    expect(hideHomePaths(path.join(luciHomeLabel().dir, 'skills', 'a', 'SKILL.md'), { homeDir })).toBe('$LUCI_HOME/skills/a/SKILL.md');
  });
});
