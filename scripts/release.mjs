// Packs and publishes Luci's public packages (see docs/RELEASING.md). The Release workflow runs it; it
// works the same on a machine.
//
//   node scripts/release.mjs pack <dir>                 one .tgz per public package, workspace:* resolved
//   node scripts/release.mjs publish <dir> [--dry-run]  publish them, dependencies first
//
// Publishing skips a package whose version is already on npm, so a run that stopped half way (an
// expired login, a network error) is finished by running it again. In GitHub Actions, npm signs each
// package with provenance through Trusted Publishing: no token is needed.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [mode, dirArg, ...flags] = process.argv.slice(2);
if (!['pack', 'publish'].includes(mode ?? '') || !dirArg) {
  console.error('Usage: node scripts/release.mjs pack <dir> | publish <dir> [--dry-run]');
  process.exit(1);
}
const dir = path.resolve(dirArg);
const dryRun = flags.includes('--dry-run');
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', shell: process.platform === 'win32', ...opts });

/** The public packages, dependencies before the packages that use them. */
function publicPackages() {
  const pkgs = fs.readdirSync('packages')
    .map(name => ({ dir: path.join('packages', name), file: path.join('packages', name, 'package.json') }))
    .filter(p => fs.existsSync(p.file))
    .map(p => ({ ...p, json: JSON.parse(fs.readFileSync(p.file, 'utf8')) }))
    .filter(p => !p.json.private);
  const names = new Set(pkgs.map(p => p.json.name));
  const ordered = [];
  const visit = (p, seen = new Set()) => {
    if (ordered.includes(p)) return;
    if (seen.has(p)) throw new Error(`Dependency cycle at ${p.json.name}`);
    seen.add(p);
    for (const dep of Object.keys(p.json.dependencies ?? {}).filter(d => names.has(d))) visit(pkgs.find(q => q.json.name === dep), seen);
    ordered.push(p);
  };
  for (const p of pkgs) visit(p);
  return ordered;
}
const tarball = (p) => path.join(dir, `${p.json.name.replace(/^@/, '').replace('/', '-')}-${p.json.version}.tgz`);

if (mode === 'pack') {
  fs.mkdirSync(dir, { recursive: true });
  for (const p of publicPackages()) {
    // pnpm pack replaces workspace:* with the real version; npm pack would not
    const res = run('pnpm', ['pack', '--pack-destination', dir], { cwd: p.dir });
    if (res.status !== 0) { console.error(res.stdout, res.stderr); process.exit(1); }
    const manifest = execFileSync('tar', ['-xOzf', tarball(p), 'package/package.json'], { encoding: 'utf8' });
    if (manifest.includes('workspace:')) { console.error(`${p.json.name}: workspace: left in its package.json`); process.exit(1); }
    console.log(`packed ${path.basename(tarball(p))}`);
  }
} else {
  let failed = false;
  for (const p of publicPackages()) {
    const id = `${p.json.name}@${p.json.version}`;
    const onNpm = run('npm', ['view', id, 'version']).stdout.trim();
    if (onNpm === p.json.version) { console.log(`skip ${id} (already on npm)`); continue; }
    if (!fs.existsSync(tarball(p))) { console.error(`missing ${tarball(p)}: run pack first`); process.exit(1); }
    // A pre-release (0.6.0-rc.1) goes out under "next", so `@latest` keeps giving people the last real release
    const tag = p.json.version.includes('-') ? ['--tag', 'next'] : [];
    const args = ['publish', tarball(p), '--access', 'public', ...tag, ...(process.env.GITHUB_ACTIONS ? ['--provenance'] : []), ...(dryRun ? ['--dry-run'] : [])];
    const res = run('npm', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    if (res.status === 0) { console.log(`${dryRun ? 'would publish' : 'published'} ${id}`); continue; }
    console.error(`FAILED ${id}\n${res.stderr.split('\n').filter(l => /npm (error|ERR)/.test(l)).slice(0, 6).join('\n')}`);
    failed = true;
    break;
  }
  if (failed) process.exit(1);
}
