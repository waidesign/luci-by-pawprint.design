import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Tests never touch the real ~/.luci: every test file gets a throwaway LUCI_HOME
process.env.LUCI_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'luci-test-home-'));
