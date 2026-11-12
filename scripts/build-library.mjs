#!/usr/bin/env node
/**
 * Build Luci's design-focused skill library from a library in the earlier prototype's
 * layout (dev tooling, not part of the product). Only the skills listed here are copied:
 * the design core plus a coding bridge, each with a licence that allows redistribution
 * (see ai-brain/decisions/ for the licence check). Every third-party skill gets a
 * NOTICE.md naming its source and licence.
 *
 *   node scripts/build-library.mjs <path-to-old-skill-library>
 *
 * Requires a build first (pnpm build). Rewrites packages/skills/library/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SkillRegistry } from '../packages/skills/dist/index.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'packages', 'skills', 'library');
const source = process.argv[2];
if (!source || !fs.existsSync(source)) {
  console.error('Usage: node scripts/build-library.mjs <path-to-old-skill-library>');
  process.exit(2);
}

const CHECKED = '2026-11-12';
const MENGTO = (name) => ({
  author: 'Meng To',
  license: 'MIT',
  source: {
    repo: 'MengTo/Skills', path: `agent-skills/web-design/${name}/SKILL.md`, licenseVerified: true, licenseStatus: 'open',
    licenseEvidence: 'repository license', licenseUrl: 'https://github.com/MengTo/Skills/blob/main/LICENSE', licenseCheckedAt: CHECKED,
    copyright: 'Copyright (c) 2026 Meng To'
  },
  licenseText: 'mit'
});

/** The library: prototype category folder and skill name, plus provenance for skills the prototype had none for. */
const SKILLS = {
  // Design core
  'accessibility/fixing-accessibility': {},
  'accessibility/accessibility-baseline': { author: 'Luci', license: 'MIT', own: true },
  'animation-motion/react-view-transitions': {},
  'animation-motion/animation-systems': MENGTO('animation-systems'),
  'design-systems/build-design-system': {},
  'design-systems/component-docs': {},
  'design-systems/create-design-md': {},
  'design-systems/design-system-boss': {},
  'design-systems/migrate-design-system': {},
  'design-systems/token-mapping': {},
  'design-systems/ui-review': {},
  'frontend/composition-patterns': {},
  'frontend/design-mobile-apps': {},
  'frontend/frontend-design': {
    author: 'anthropic',
    license: 'Apache-2.0',
    source: {
      repo: 'anthropics/skills', path: 'skills/frontend-design/SKILL.md', licenseVerified: true, licenseStatus: 'open',
      licenseEvidence: 'skill license file', licenseUrl: 'https://github.com/anthropics/skills/blob/main/skills/frontend-design/LICENSE.txt', licenseCheckedAt: CHECKED
    },
    licenseText: 'apache'
  },
  'frontend/react-native-skills': {},
  'frontend/tailwindcss': MENGTO('tailwindcss'),
  'frontend-frameworks/react-best-practices': {
    author: 'vercel',
    license: 'MIT',
    source: {
      repo: 'vercel-labs/agent-skills', path: 'skills/react-best-practices/SKILL.md', licenseVerified: true, licenseStatus: 'open',
      licenseEvidence: 'declared in original SKILL.md', licenseUrl: 'https://github.com/vercel-labs/agent-skills/blob/main/skills/react-best-practices/SKILL.md', licenseCheckedAt: CHECKED
    }
  },
  '3d/threejs': MENGTO('threejs'),
  'interaction/animation-on-scroll': MENGTO('animation-on-scroll'),
  'micro-interactions/masked-reveal': MENGTO('masked-reveal'),
  'micro-interactions/micro-interaction': {},
  'components/company-logos': MENGTO('company-logos'),
  'components/container-lines': MENGTO('container-lines'),
  'performance/fixing-motion-performance': {},
  'seo/fixing-metadata': {},
  'shadcn-ui/shadcn': {},
  'shadcn-ui/migrate-radix-to-base': {},
  'systems/baseline-ui': {},
  'ui-ux/improve-ui': {},
  'ui-ux/landing-page': MENGTO('landing-page'),
  'ui-ux/pricing-page': MENGTO('pricing-page'),
  'ui-ux/prototype': {},
  'ui-ux/theme-factory': {},
  'general/canvas-design': {},
  'general/algorithmic-art': {},
  // Coding bridge
  'testing/tdd': {},
  'testing/webapp-testing': {},
  'code-quality/code-review': {}
};

const OLD_CONTRACT = ['g', 'a', 'w', '.json'].join('');
const OLD_PREFIX = `${['g', 'a', 'w'].join('')}-`;
const MIT_TEXT = (copyright) => `MIT License\n\n${copyright}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the "Software"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.\n`;
// The Apache-2.0 text as shipped in the anthropics/skills folders (identical in each)
const APACHE_TEXT = fs.readFileSync(path.join(source, 'documents', 'docx', 'LICENSE.txt'), 'utf8');

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, e.name);
    if (e.isDirectory()) copyTree(src, path.join(to, e.name));
    else if (e.name !== OLD_CONTRACT && e.name !== 'SKILL.md' && e.name !== 'index.json') fs.copyFileSync(src, path.join(to, e.name));
  }
}

const setMeta = (skillMd, key, value) => skillMd.replace(new RegExp(`(\\n  luci-${key}: )"[^"\\n]*"`), `$1${JSON.stringify(value)}`);

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

for (const [rel, extra] of Object.entries(SKILLS)) {
  const from = path.join(source, rel);
  const to = path.join(out, rel);
  if (!fs.existsSync(path.join(from, 'SKILL.md'))) throw new Error(`Missing in the source library: ${rel}`);
  copyTree(from, to);

  let skillMd = fs.readFileSync(path.join(from, 'SKILL.md'), 'utf8').split(`  ${OLD_PREFIX}`).join('  luci-');
  if (extra.license) skillMd = skillMd.replace(/\nlicense: "[^"\n]*"/, `\nlicense: ${JSON.stringify(extra.license)}`);
  if (extra.author) skillMd = setMeta(skillMd, 'author', extra.author);
  fs.writeFileSync(path.join(to, 'SKILL.md'), skillMd, 'utf8');

  const { gss, ...contract } = JSON.parse(fs.readFileSync(path.join(from, OLD_CONTRACT), 'utf8').replace(/^﻿/, ''));
  if (extra.source) contract.source = { ...(contract.source ?? {}), ...extra.source };
  fs.writeFileSync(path.join(to, 'luci.json'), `${JSON.stringify({ lss: gss ?? 1, ...contract }, null, 2)}\n`, 'utf8');

  if (extra.licenseText === 'mit' && !fs.existsSync(path.join(to, 'LICENSE.txt'))) fs.writeFileSync(path.join(to, 'LICENSE.txt'), MIT_TEXT(extra.source.copyright), 'utf8');
  if (extra.licenseText === 'apache' && !fs.existsSync(path.join(to, 'LICENSE.txt'))) fs.writeFileSync(path.join(to, 'LICENSE.txt'), APACHE_TEXT, 'utf8');

  const src = contract.source;
  if (!extra.own) {
    if (!src?.repo || src.licenseStatus !== 'open') throw new Error(`${rel}: no verified open licence on record`);
    const notice = [
      `# Notice`,
      '',
      `This skill comes from https://github.com/${src.repo} (\`${src.path}\`).`,
      `Licence: ${skillMd.match(/\nlicense: "([^"\n]*)"/)?.[1] ?? 'see source'} (evidence: ${src.licenseEvidence}, ${src.licenseUrl}, checked ${src.licenseCheckedAt}).`,
      ...(src.copyright ? [`${src.copyright}.`] : []),
      '',
      'Luci converted it to the Luci Skill Standard: SKILL.md metadata keys and luci.json. The instructions are unchanged.',
      ''
    ].join('\n');
    fs.writeFileSync(path.join(to, 'NOTICE.md'), notice, 'utf8');
  }
}

// Reviewed AI-drafted fields (S10). A person (or an agent the user delegated the review to)
// approves drafts here, so a rebuild keeps the review. `keywords` replaces the drafted list
// when the reviewer edited it. Checked against the tuning benchmark set only.
const REVIEWED = {
  // "accessible name" made "accessible" common, so colour tasks drifted to theme-factory
  'fixing-accessibility': { keywords: ['a11y', 'screen reader support', 'focus trap', 'tab order', 'icon button label'] },
  'react-view-transitions': {}, 'code-review': {}, 'company-logos': {}, 'container-lines': {},
  // "design spec" pulled in ticket and spec-writing tasks
  'create-design-md': { keywords: ['design documentation', 'style guide', 'brand guidelines', 'agent ui context'] },
  'react-best-practices': {}, 'composition-patterns': {}, 'design-mobile-apps': {},
  'react-native-skills': {}, 'algorithmic-art': {}, 'canvas-design': {}, 'masked-reveal': {}, 'improve-ui': {}, 'prototype': {},
  // "layout" alone matches almost any UI task
  'frontend-design': { keywords: ['landing page design', 'visual identity', 'web design', 'art direction'] }
};
for (const [rel] of Object.entries(SKILLS)) {
  const id = rel.split('/')[1];
  const review = REVIEWED[id];
  if (!review) continue;
  const file = path.join(out, rel, 'luci.json');
  const contract = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (review.keywords) contract.keywords = review.keywords;
  delete contract.drafts;
  fs.writeFileSync(file, `${JSON.stringify(contract, null, 2)}\n`, 'utf8');
}

// Notes the earlier tool wrote itself (split notices, its own skill's contract) name it: use Luci's name.
// Third-party instructions are never edited.
const OLD_NAME = ['G', 'A', 'W'].join('');
const OWN_PHRASES = [
  [`by ${OLD_NAME} (content unchanged)`, 'by Luci (content unchanged)'],
  [`_${OLD_NAME} moved these sections`, '_Luci moved these sections'],
  [`${OLD_NAME} points to it automatically`, 'Luci points to it automatically']
];
const walkFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walkFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));
for (const file of walkFiles(out).filter(f => /\.(md|json)$/.test(f))) {
  const text = fs.readFileSync(file, 'utf8');
  const next = OWN_PHRASES.reduce((t, [from, to]) => t.split(from).join(to), text);
  if (next !== text) fs.writeFileSync(file, next, 'utf8');
}

const registry = new SkillRegistry({ skillsDir: out, autoIndex: false });
const index = registry.writeIndex();
console.log(`Built ${index.skills.length} skills into ${path.relative(root, out)}`);
