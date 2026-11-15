/**
 * Design captures saved into the project (.luci/design/): the toolbar's files, word for word as the
 * person saw them, after a check that each is a capture file Luci can read. Agents list and read
 * them over MCP. The store never creates .luci/ itself.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MEMORY_FILES, PRODUCT } from '@luci-dev/format';
import { CAPTURE_EXTENSION, parseCapture, parseCollection } from '@luci-dev/format/capture';
import { memoryDir } from '../layout/brainLayout.js';
import { writeAtomic } from '../feedback/feedbackStore.js';

/** A flat capture file name: example-com.component.card.design.md, basket-2026-11-13.collection.design.md. */
export const DESIGN_FILE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*){1,2}\.design\.md$/;
/** At most this many bytes per file (a whole-page reference of a large site is about 100 KB). */
export const MAX_DESIGN_BYTES = 2 * 1024 * 1024;

export interface DesignFile {
  file: string;
  name: string;
  scope: string;
  type: string;
  source: string;
  captured: string;
  bytes: number;
}

export class DesignError extends Error {}

export class DesignStore {
  readonly dir: string;

  constructor(readonly projectDir: string) {
    this.dir = path.join(memoryDir(projectDir), MEMORY_FILES.design);
  }

  get available(): boolean {
    return fs.existsSync(memoryDir(this.projectDir));
  }

  /** Save one capture or basket export. Returns its path inside the project and whether it replaced a file. */
  save(fileName: string, markdown: string): { path: string; replaced: boolean } {
    if (!DESIGN_FILE_NAME.test(fileName) || !fileName.endsWith(CAPTURE_EXTENSION)) throw new DesignError(`Not a capture file name: ${fileName}`);
    if (Buffer.byteLength(markdown, 'utf8') > MAX_DESIGN_BYTES) throw new DesignError(`${fileName} is larger than ${MAX_DESIGN_BYTES / 1024 / 1024} MB.`);
    const parsed = fileName.includes('.collection.') ? parseCollection(markdown) : parseCapture(markdown);
    if (!parsed.ok) throw new DesignError(`${fileName} is not a capture file Luci can read: ${parsed.error}`);
    if (!this.available) throw new DesignError(`No ${PRODUCT.projectDir}/ in ${this.projectDir}. Run \`${PRODUCT.command} init\` there first.`);
    fs.mkdirSync(this.dir, { recursive: true });
    const file = path.join(this.dir, fileName);
    const replaced = fs.existsSync(file);
    writeAtomic(file, markdown.endsWith('\n') ? markdown : `${markdown}\n`);
    return { path: `${PRODUCT.projectDir}/${MEMORY_FILES.design}/${fileName}`, replaced };
  }

  /** Every saved capture with its frontmatter, newest capture date first. */
  list(): DesignFile[] {
    if (!fs.existsSync(this.dir)) return [];
    const out: DesignFile[] = [];
    for (const file of fs.readdirSync(this.dir).filter(f => DESIGN_FILE_NAME.test(f))) {
      const text = fs.readFileSync(path.join(this.dir, file), 'utf8');
      const fm = /^---\n([\s\S]*?)\n---/.exec(text.replace(/\r\n/g, '\n'))?.[1] ?? '';
      const field = (k: string) => /^"?(.*?)"?$/.exec(new RegExp(`^${k}: (.*)$`, 'm').exec(fm)?.[1]?.trim() ?? '')?.[1] ?? '';
      out.push({ file, name: field('name'), scope: field('scope'), type: field('type') || field('scope'), source: field('source') || field('sources'), captured: field('captured'), bytes: Buffer.byteLength(text) });
    }
    return out.sort((a, b) => b.captured.localeCompare(a.captured) || a.file.localeCompare(b.file));
  }

  /** One saved file's text, or null. Only names in the folder are read (no paths). */
  read(fileName: string): string | null {
    if (!DESIGN_FILE_NAME.test(fileName)) return null;
    const file = path.join(this.dir, fileName);
    return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  }
}
