// Script to bump version across all monorepo packages, root package.json, and README.md
import fs from 'node:fs';
import path from 'node:path';

const targetVersion = process.argv[2] || '0.5.3';
const packages = ['brain', 'capture', 'cli', 'extension', 'feedback', 'format', 'mcp', 'skills', 'toolbar', 'ui'];

// 1. Root package.json
const rootPkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const oldVersion = rootPkg.version;
rootPkg.version = targetVersion;
fs.writeFileSync('package.json', JSON.stringify(rootPkg, null, 2) + '\n', 'utf8');

// 2. Packages
for (const p of packages) {
  const pPath = path.join('packages', p, 'package.json');
  if (fs.existsSync(pPath)) {
    const pkg = JSON.parse(fs.readFileSync(pPath, 'utf8'));
    pkg.version = targetVersion;
    fs.writeFileSync(pPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  }
}

// 3. README.md
let readme = fs.readFileSync('README.md', 'utf8');
readme = readme.replace(new RegExp(`\`${oldVersion}\``, 'g'), `\`${targetVersion}\``);
fs.writeFileSync('README.md', readme, 'utf8');

console.log(`Bumped version ${oldVersion} -> ${targetVersion} across monorepo packages and README.md`);
