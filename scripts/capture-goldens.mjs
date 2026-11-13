// Write the golden capture files from packages/format/fixtures/capture/*inputs.json (after a build).
// Review every changed golden by eye before committing: they are the spec the formatter must meet.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../packages/format/fixtures/capture/', import.meta.url));
const { formatCapture, captureFileName, formatCollection, collectionFileName } = await import(new URL('../packages/format/dist/capture/index.js', import.meta.url).href);
const read = (file) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));

for (const file of ['inputs.json', 'component-inputs.json']) {
  for (const [name, { capture, settings }] of Object.entries(read(file))) {
    if (captureFileName(capture.meta) !== name) throw new Error(`${name}: the formatter names it ${captureFileName(capture.meta)}`);
    fs.writeFileSync(path.join(dir, name), formatCapture(capture, settings), 'utf8');
    console.log(`wrote ${name}`);
  }
}
// Feedback prompts (packages/format/fixtures/feedback/)
const feedbackDir = fileURLToPath(new URL('../packages/format/fixtures/feedback/', import.meta.url));
const { formatFeedbackPrompt, feedbackItemSchema } = await import(new URL('../packages/format/dist/feedback/index.js', import.meta.url).href);
for (const [name, { items, options }] of Object.entries(JSON.parse(fs.readFileSync(path.join(feedbackDir, 'prompt-inputs.json'), 'utf8')))) {
  fs.writeFileSync(path.join(feedbackDir, name), formatFeedbackPrompt(items.map(i => feedbackItemSchema.parse(i)), options), 'utf8');
  console.log(`wrote feedback/${name}`);
}
for (const [name, { collection, settings }] of Object.entries(read('collection-inputs.json'))) {
  if (collectionFileName(collection.name) !== name) throw new Error(`${name}: the formatter names it ${collectionFileName(collection.name)}`);
  fs.writeFileSync(path.join(dir, name), formatCollection(collection, settings), 'utf8');
  console.log(`wrote ${name}`);
}
