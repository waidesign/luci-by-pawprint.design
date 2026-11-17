// Sets one version everywhere Luci states it: the root and every package's package.json, LUCI_VERSION in
// @luci-dev/ui (what the toolbar and menus show) and the package table in README.md.
// Usage: node scripts/bump-version.mjs 0.5.7   (the Release workflow runs it the same way)
import fs from 'node:fs';
import path from 'node:path';

const targetVersion = process.argv[2];
if (!targetVersion || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(targetVersion)) {
  console.error('Usage: node scripts/bump-version.mjs <version>, for example 0.5.7');
  process.exit(1);
}
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

// 3. LUCI_VERSION (a test keeps it equal to the packages' version)
const aboutPath = path.join('packages', 'ui', 'src', 'about.ts');
const about = fs.readFileSync(aboutPath, 'utf8');
const nextAbout = about.replace(/export const LUCI_VERSION = '[^']*';/, `export const LUCI_VERSION = '${targetVersion}';`);
if (nextAbout === about && oldVersion !== targetVersion) {
  console.error(`Could not find LUCI_VERSION in ${aboutPath}`);
  process.exit(1);
}
fs.writeFileSync(aboutPath, nextAbout, 'utf8');

// 4. README.md
let readme = fs.readFileSync('README.md', 'utf8');
readme = readme.replace(new RegExp(`\`${oldVersion.replace(/\./g, '\\.')}\``, 'g'), `\`${targetVersion}\``);
fs.writeFileSync('README.md', readme, 'utf8');

console.log(`Bumped version ${oldVersion} -> ${targetVersion} across the packages, LUCI_VERSION and README.md`);
