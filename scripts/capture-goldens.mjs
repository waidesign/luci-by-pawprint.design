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
// Design check (v0.3): the built button against the primary-button design (packages/format/fixtures/check/)
{
  const checkDir = fileURLToPath(new URL('../packages/format/fixtures/check/', import.meta.url));
  const { readComponentFile, checkComponent, formatCheckReport } = await import(new URL('../packages/format/dist/capture/index.js', import.meta.url).href);
  const spec = (file) => { const r = readComponentFile(fs.readFileSync(file, 'utf8')); if (!r.ok) throw new Error(`${file}: ${r.error}`); return r.value; };
  const design = spec(path.join(dir, 'example-com.component.primary-button.design.md'));
  const built = spec(path.join(checkDir, 'localhost-5173.component.primary-button.design.md'));
  const result = checkComponent(design, built, { knownTokens: ['--radius-md'] });
  const report = formatCheckReport(result, { selector: built.meta.selector, page: built.meta.source, designFile: '.luci/design/example-com.component.primary-button.design.md' });
  fs.writeFileSync(path.join(checkDir, 'primary-button.check.md'), report, 'utf8');
  console.log('wrote check/primary-button.check.md');
}
// Capture to rule (v0.3.2): a proposed rule from each component golden (packages/format/fixtures/rule/)
{
  const ruleDir = fileURLToPath(new URL('../packages/format/fixtures/rule/', import.meta.url));
  fs.mkdirSync(ruleDir, { recursive: true });
  const { readComponentFile, ruleFromComponent } = await import(new URL('../packages/format/dist/capture/index.js', import.meta.url).href);
  const { formatProposal } = await import(new URL('../packages/format/dist/index.js', import.meta.url).href);
  for (const name of ['primary-button', 'card']) {
    const file = `example-com.component.${name}.design.md`;
    const r = readComponentFile(fs.readFileSync(path.join(dir, file), 'utf8'));
    if (!r.ok) throw new Error(`${file}: ${r.error}`);
    fs.writeFileSync(path.join(ruleDir, `${name}.proposal.md`), formatProposal(ruleFromComponent(r.value, `.luci/design/${file}`)), 'utf8');
    console.log(`wrote rule/${name}.proposal.md`);
  }
}
// Multi-page system merge (v0.3.3): /pricing (the system goldens' inputs) + /blog (packages/format/fixtures/merge/)
{
  const mergeDir = fileURLToPath(new URL('../packages/format/fixtures/merge/', import.meta.url));
  const { mergeSystems } = await import(new URL('../packages/format/dist/capture/index.js', import.meta.url).href);
  const pageInputs = read('inputs.json');
  for (const [name, { settings, base, others }] of Object.entries(JSON.parse(fs.readFileSync(path.join(mergeDir, 'inputs.json'), 'utf8')))) {
    const merged = mergeSystems([pageInputs[base].capture, ...others], { captured: '2026-11-14' });
    if (captureFileName(merged.meta) !== name) throw new Error(`${name}: the formatter names it ${captureFileName(merged.meta)}`);
    fs.writeFileSync(path.join(mergeDir, name), formatCapture(merged, settings), 'utf8');
    console.log(`wrote merge/${name}`);
  }
}
// Feedback prompts (packages/format/fixtures/feedback/)
const feedbackDir = fileURLToPath(new URL('../packages/format/fixtures/feedback/', import.meta.url));
const { formatFeedbackPrompt, formatLayoutPrompt, formatWireframePrompt, feedbackItemSchema, wireframeSchema } = await import(new URL('../packages/format/dist/feedback/index.js', import.meta.url).href);
for (const [name, input] of Object.entries(JSON.parse(fs.readFileSync(path.join(feedbackDir, 'layout-prompt-inputs.json'), 'utf8')))) {
  fs.writeFileSync(path.join(feedbackDir, name), formatLayoutPrompt(input), 'utf8');
  console.log(`wrote feedback/${name}`);
}
for (const [name, input] of Object.entries(JSON.parse(fs.readFileSync(path.join(feedbackDir, 'wireframe-prompt-inputs.json'), 'utf8')))) {
  fs.writeFileSync(path.join(feedbackDir, name), formatWireframePrompt({ ...input, wireframe: wireframeSchema.parse(input.wireframe) }), 'utf8');
  console.log(`wrote feedback/${name}`);
}
for (const [name, { items, options }] of Object.entries(JSON.parse(fs.readFileSync(path.join(feedbackDir, 'prompt-inputs.json'), 'utf8')))) {
  fs.writeFileSync(path.join(feedbackDir, name), formatFeedbackPrompt(items.map(i => feedbackItemSchema.parse(i)), options), 'utf8');
  console.log(`wrote feedback/${name}`);
}
for (const [name, { collection, settings }] of Object.entries(read('collection-inputs.json'))) {
  if (collectionFileName(collection.name) !== name) throw new Error(`${name}: the formatter names it ${collectionFileName(collection.name)}`);
  fs.writeFileSync(path.join(dir, name), formatCollection(collection, settings), 'utf8');
  console.log(`wrote ${name}`);
}
