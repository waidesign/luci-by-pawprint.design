// Write the golden capture files from packages/format/fixtures/capture/inputs.json (after a build).
// Review every changed golden by eye before committing: they are the spec the formatter must meet.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../packages/format/fixtures/capture/', import.meta.url));
const { formatCapture, captureFileName } = await import(new URL('../packages/format/dist/capture/index.js', import.meta.url).href);
const inputs = JSON.parse(fs.readFileSync(path.join(dir, 'inputs.json'), 'utf8'));
for (const [file, { capture, settings }] of Object.entries(inputs)) {
  if (captureFileName(capture.meta) !== file) throw new Error(`${file}: the formatter names it ${captureFileName(capture.meta)}`);
  fs.writeFileSync(path.join(dir, file), formatCapture(capture, settings), 'utf8');
  console.log(`wrote ${file}`);
}
