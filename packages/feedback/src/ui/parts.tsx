/**
 * Choosing a new part (Layout mode steps 2 and 3): the app's own components on the page, captures
 * saved in the project, or generic blocks. Insert and the new-page sketch both use it.
 */
import { ButtonSpinner, selectorFor } from '@luci/capture';
import { LAYOUT_BLOCKS, type Part } from '@luci/format/feedback';
import type { FeedbackBackend, SavedCapture } from '../backend.js';
import { pageComponents, type PageComponent } from '../layout/catalog.js';
import { describeTarget, nameOf } from '../target.js';

/** What can be chosen: read when the catalog opens. Captures: 'none' without the project. */
export interface PartSources {
  components: PageComponent[];
  captures: SavedCapture[] | 'loading' | 'error' | 'none';
}

/** A chosen part, with the component on the page it copies and a capture's type. */
export interface Chosen { what: Part; example?: Element; captureType?: string }

export const EMPTY_SOURCES: PartSources = { components: [], captures: 'none' };

/** Read the page's components now, and the project's saved component captures (they come later). */
export function loadSources(doc: Document, backend: FeedbackBackend, set: (s: PartSources) => void): void {
  const components = pageComponents(doc);
  if (!backend.listCaptures) { set({ components, captures: 'none' }); return; }
  set({ components, captures: 'loading' });
  backend.listCaptures().then(
    files => set({ components, captures: files.filter(f => f.scope === 'component') }),
    () => set({ components, captures: 'error' })
  );
}

/** The part as a prompt names it: a component gets the selector and name of the one it copies. */
export function namedPart(c: Chosen): Part {
  return c.what.kind === 'component' && c.example
    ? { ...c.what, example: { selector: selectorFor(c.example, c.example.getRootNode() as Document | ShadowRoot), element: nameOf(c.example) } }
    : c.what;
}

/** The component's file, from the one on the page (its source map may take a moment); null when unknown. */
export async function componentFile(c: Chosen, backend: FeedbackBackend): Promise<string | null> {
  if (c.what.kind !== 'component' || !c.example) return null;
  try {
    const { target } = await describeTarget(c.example, backend.resolveFrames ? { serverResolve: backend.resolveFrames } : {});
    return target.source?.file ?? null;
  } catch {
    return null;
  }
}

/** "PlanCard", "Card (capture)", "card grid". */
export const partName = (what: Part) => (what.kind === 'capture' ? `${what.name} (capture)` : what.name);

export function PartPicker(props: { sources: PartSources; onChoose: (c: Chosen) => void }) {
  const { components, captures } = props.sources;
  return (
    <>
      <div class="cat-group" data-group="components">
        <h3>Your components <span class="dim">on this page</span></h3>
        {components.length ? (
          <div class="cat-list">
            {components.map(c => (
              <button type="button" data-insert={`component:${c.name}`} title={`Another ${c.name}, like the one on this page`} onClick={() => props.onChoose({ what: { kind: 'component', name: c.name }, example: c.example })}>
                {c.name}{c.count > 1 && <span class="dim"> ×{c.count}</span>}
              </button>
            ))}
          </div>
        ) : <p class="dim">None found here. Luci reads React, Vue and Svelte components in a development build.</p>}
      </div>
      <div class="cat-group" data-group="captures">
        <h3>Saved captures <span class="dim">.luci/design/</span></h3>
        {captures === 'none' ? <p class="dim">Run <code>luci serve</code> in your project to use the captures saved there.</p>
          : captures === 'loading' ? <p class="loading"><ButtonSpinner />Reading the project's captures…</p>
          : captures === 'error' ? <p class="error">Could not read the project's captures. Is <code>luci serve</code> still running?</p>
          : captures.length ? (
            <div class="cat-list">
              {captures.map(c => (
                <button type="button" data-insert={`capture:${c.file}`} title={`${c.type} from ${c.source}`}
                  onClick={() => props.onChoose({ what: { kind: 'capture', name: c.name || c.file, file: `.luci/design/${c.file}` }, captureType: c.type })}>
                  {c.name || c.file} <span class="dim">{c.type}</span>
                </button>
              ))}
            </div>
          ) : <p class="dim">None saved yet. In Capture mode, take a component and press Save to project.</p>}
      </div>
      <div class="cat-group" data-group="blocks">
        <h3>Blocks</h3>
        <div class="cat-list">
          {LAYOUT_BLOCKS.map(b => <button type="button" data-insert={`block:${b}`} onClick={() => props.onChoose({ what: { kind: 'block', name: b } })}>{b}</button>)}
        </div>
      </div>
    </>
  );
}
