/**
 * The project design baseline (B14): read the project's own stylesheets and write its typography,
 * color and spacing systems into .luci/design/ as project.system.<type>.design.md, so agents reuse the
 * project's values and tokens. `luci init` builds it for a project with stylesheets; `luci capture
 * baseline` rebuilds it. The person's own instructions in a baseline file survive a rebuild.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MEMORY_FILES, PRODUCT } from '@luci-dev/format';
import {
  BASELINE_FILES, INSTRUCTIONS_HEADING, buildBaseline, formatCapture, withInstructions,
  type Baseline, type StylesheetSource
} from '@luci-dev/format/capture';
import { findProjectRoot, memoryDir } from '../layout/brainLayout.js';
import { DesignStore } from './designStore.js';

/** Folders never read: dependencies, builds, caches, Luci's own and version control. */
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', '.output', '.vercel', '.netlify',
  '.turbo', '.cache', '.parcel-cache', '.vite', 'coverage', 'storybook-static', '.luci', 'graphify-out', 'vendor', 'target', '.venv', 'venv'
]);
const STYLESHEET = /\.(css|scss|less|pcss|postcss)$/i;
/** Components whose <style> blocks hold stylesheets. */
const COMPONENT_FILE = /\.(vue|svelte|astro)$/i;
/** Enough for any project's own styles; stops a stray copy of a framework from taking over. */
export const MAX_STYLESHEETS = 400;
const MAX_STYLESHEET_BYTES = 1024 * 1024;

/** The project's stylesheets (and component <style> blocks), its own only: no minified files, no dependencies. */
export function findStylesheets(projectDir: string): StylesheetSource[] {
  const out: StylesheetSource[] = [];
  const visit = (dir: string) => {
    if (out.length >= MAX_STYLESHEETS) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (out.length >= MAX_STYLESHEETS) return;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) visit(full); continue; }
      if (!e.isFile() || /\.min\.css$/i.test(e.name) || !(STYLESHEET.test(e.name) || COMPONENT_FILE.test(e.name))) continue;
      let text: string;
      try {
        if (fs.statSync(full).size > MAX_STYLESHEET_BYTES) continue;
        text = fs.readFileSync(full, 'utf8');
      } catch { continue; }
      const file = path.relative(projectDir, full).replace(/\\/g, '/');
      if (STYLESHEET.test(e.name)) { out.push({ file, text }); continue; }
      // A component's <style> blocks, read as the language they say (scss, less) or CSS
      const blocks = [...text.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi)];
      for (const [i, m] of blocks.entries()) {
        const lang = /lang=["']?(scss|less)/i.exec(m[1] ?? '')?.[1]?.toLowerCase();
        out.push({ file: `${file}${blocks.length > 1 ? `#style-${i + 1}` : ''}${lang ? `.${lang}` : ''}`, text: m[2] ?? '' });
      }
    }
  };
  visit(projectDir);
  return out;
}

export interface BaselineReport {
  /** Stylesheets read (project-relative). */
  stylesheets: string[];
  /** Custom properties found at the stylesheets' root. */
  tokens: number;
  /** Files written (or, in a dry run, that would be), project-relative. */
  written: string[];
  /** Earlier baseline files removed because their system is gone. */
  removed: string[];
  baseline: Baseline;
}

/** Build the baseline from the project's stylesheets and write it into .luci/design/ (needs .luci/). */
export function writeBaseline(projectDir: string, options: { dryRun?: boolean; captured?: string } = {}): BaselineReport {
  const dir = path.resolve(findProjectRoot(projectDir).root);
  const sources = findStylesheets(dir);
  const baseline = buildBaseline(sources, { project: path.basename(dir), captured: options.captured ?? new Date().toISOString().slice(0, 10) });
  const store = new DesignStore(dir);
  const report: BaselineReport = { stylesheets: baseline.files, tokens: baseline.tokens.length, written: [], removed: [], baseline };
  const rel = (file: string) => `${PRODUCT.projectDir}/${MEMORY_FILES.design}/${file}`;
  for (const type of ['typography', 'color', 'spacing'] as const) {
    const file = BASELINE_FILES[type];
    const capture = baseline[type];
    const existing = store.read(file);
    if (!capture) {
      if (existing !== null) {
        if (!options.dryRun) fs.rmSync(path.join(store.dir, file), { force: true });
        report.removed.push(rel(file));
      }
      continue;
    }
    // The person's instructions in the earlier file stay with the rebuilt one
    const instructions = existing ? /^## Your instructions\n([\s\S]*?)(?=\n## |\s*$)/m.exec(existing.replace(/\r\n/g, '\n'))?.[1]?.trim() : undefined;
    const markdown = withInstructions(formatCapture(capture), instructions && instructions !== INSTRUCTIONS_HEADING ? instructions : undefined);
    if (!options.dryRun) store.save(file, markdown);
    report.written.push(rel(file));
  }
  return report;
}

/** Whether a project has a .luci/ to write the baseline into. */
export const canWriteBaseline = (projectDir: string) => fs.existsSync(memoryDir(findProjectRoot(projectDir).root));
