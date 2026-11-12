import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';

// Tests never touch the real ~/.luci: every test file gets a throwaway LUCI_HOME
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'luci-test-home-'));
process.env.LUCI_HOME = home;

afterAll(() => {
  fs.rmSync(home, { recursive: true, force: true });
});
